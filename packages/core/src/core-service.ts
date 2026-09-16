import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { mimeFor } from './util/mime.js';
import { openDatabase, transaction, type Database } from './db/database.js';
import { schemaVersion } from './db/migrations.js';
import type { SecretCipher } from './security/secret-cipher.js';
import type {
  AccountInfo,
  AddAccountInput,
  CoreStatus,
  JobInfo,
  NodeInfo,
} from './api-types.js';
import { ProviderRegistry } from './providers/registry.js';
import type { AuthInput, Credentials, StorageProvider } from './providers/provider.js';
import { SessionManager } from './engine/session-manager.js';
import { JobQueue } from './engine/job-queue.js';
import { choosePlacement } from './engine/waiter.js';
import * as vfs from './vfs/virtual-fs.js';

export const CORE_VERSION = '0.1.0';

export interface CoreServiceOptions {
  dbPath: string;
  cacheDir: string;
  stagingDir: string;
  /** Where double-clicked files land, visible to the user (Windows Downloads). */
  downloadsDir: string;
  cipher: SecretCipher;
  /** Opens a URL in the user's browser (Electron: shell.openExternal). */
  openUrl: (url: string) => Promise<void>;
  /** Opens a local file with its default app (Electron: shell.openPath). */
  openFile?: (path: string) => Promise<void>;
  /** Extra providers (tests inject FakeProvider). */
  providers?: StorageProvider[];
  /** Retry backoff base in ms; tests shrink it. */
  retryBaseMs?: number;
  /** Minimum gap between startup verifications of the same account.
   *  Providers rate-limit logins; default 15 min. Tests pass 0. */
  verifyIntervalMs?: number;
}

/** UI-agnostic facade over the whole engine. The Electron app talks to this
 *  through a thin IPC bridge; a CLI or headless runner calls it directly. */
export class CoreService extends EventEmitter {
  readonly #db: Database;
  readonly #opts: CoreServiceOptions;
  readonly #registry: ProviderRegistry;
  readonly #sessions: SessionManager;
  readonly #queue: JobQueue;

  constructor(opts: CoreServiceOptions) {
    super();
    this.#opts = opts;
    this.#db = openDatabase(opts.dbPath);
    this.#registry = new ProviderRegistry(opts.providers ?? []);
    this.#sessions = new SessionManager(this.#db, opts.cipher, this.#registry, (accountId) => {
      this.#db.prepare("UPDATE accounts SET status = 'auth_expired' WHERE id = ?").run(accountId);
      this.#emitAccount(accountId);
    });
    this.#queue = new JobQueue({
      db: this.#db,
      sessions: this.#sessions,
      cacheDir: opts.cacheDir,
      stagingDir: opts.stagingDir,
      retryBaseMs: opts.retryBaseMs,
      onJobUpdated: (jobId) => this.#emitJob(jobId),
      onAccountUpdated: (accountId) => this.#emitAccount(accountId),
      onTreeChanged: (parentId) => this.emit('tree:changed', { parentId }),
    });
  }

  /** Crash recovery + scheduler start. Call once after construction. */
  async start(): Promise<void> {
    await this.#queue.start();
    // Fire-and-forget: truthful account statuses shortly after boot, without
    // blocking startup on network calls. Results arrive via account:updated.
    void this.#verifyAccounts();
  }

  /** Probes each account's real access: flags the broken ones (including
   *  Google tokens whose scopes became insufficient) and heals the ones
   *  that regained access. Network errors leave the status untouched. */
  async #verifyAccounts(): Promise<void> {
    const interval = this.#opts.verifyIntervalMs ?? 15 * 60 * 1000;
    const accounts = this.#db
      .prepare("SELECT id, status, last_verified_at FROM accounts WHERE status IN ('active', 'auth_expired')")
      .all() as unknown as Array<{ id: string; status: string; last_verified_at: number | null }>;
    for (const account of accounts) {
      if (Date.now() - (account.last_verified_at ?? 0) < interval) continue;
      // Stamp before probing so failures also respect the throttle window.
      this.#db
        .prepare('UPDATE accounts SET last_verified_at = ? WHERE id = ?')
        .run(Date.now(), account.id);
      try {
        this.#sessions.invalidate(account.id);
        await this.#sessions.getSession(account.id);
        if (account.status !== 'active') {
          this.#db.prepare("UPDATE accounts SET status = 'active' WHERE id = ?").run(account.id);
          this.#emitAccount(account.id);
          this.#queue.kick();
        }
      } catch {
        // AuthExpiredError already flipped the status via SessionManager's
        // onAuthExpired; anything else (offline etc.) must not flag accounts.
      }
    }
  }

  close(): void {
    this.#queue.stop();
    this.#sessions.clear();
    this.#db.close();
  }

  get db(): Database {
    return this.#db;
  }

  get cipher(): SecretCipher {
    return this.#opts.cipher;
  }

  /** Test helper: resolves when the queue drained. */
  async waitForIdle(timeoutMs?: number): Promise<void> {
    await this.#queue.waitForIdle(timeoutMs);
  }

  // ── Status / settings ──────────────────────────────────────────────────────

  async getStatus(): Promise<CoreStatus> {
    const row = this.#db.prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number };
    return {
      coreVersion: CORE_VERSION,
      schemaVersion: schemaVersion(this.#db),
      accountCount: row.n,
    };
  }

  async getSetting(key: string): Promise<string | null> {
    const row = this.#db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    this.#db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  }

  // ── Accounts ───────────────────────────────────────────────────────────────

  async listAccounts(): Promise<AccountInfo[]> {
    const rows = this.#db.prepare('SELECT * FROM accounts ORDER BY created_at').all() as Array<{
      id: string; provider: string; label: string;
      quota_total: number | null; quota_used: number | null; status: AccountInfo['status'];
    }>;
    return rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      label: r.label,
      quotaTotal: r.quota_total,
      quotaUsed: r.quota_used,
      status: r.status,
    }));
  }

  async addAccount(input: AddAccountInput): Promise<AccountInfo> {
    const auth: AuthInput =
      input.provider === 'mega'
        ? { kind: 'password', email: input.email, password: input.password }
        : input.provider === 'gdrive'
          ? { kind: 'oauth', clientId: input.clientId, clientSecret: input.clientSecret }
          : { kind: 'none' };

    const provider = this.#registry.get(input.provider);
    const creds = await provider.authorize(auth, this.#opts.openUrl);
    const session = await provider.connect(creds, async () => {});
    const quota = await session.quota();

    if (input.provider === 'gdrive') {
      // Remember client id/secret to prefill the next gdrive account dialog.
      await this.setSetting('gdrive.client_id', input.clientId);
      await this.setSetting('gdrive.client_secret', input.clientSecret);
    }

    const id = randomUUID();
    try {
      this.#db
        .prepare(
          `INSERT INTO accounts (id, provider, label, auth_blob, quota_total, quota_used, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
        )
        .run(
          id,
          input.provider,
          input.label.trim(),
          this.#opts.cipher.encrypt(JSON.stringify(creds)),
          quota.totalBytes,
          quota.usedBytes,
          Date.now(),
        );
    } catch (err) {
      if (/UNIQUE constraint failed: accounts\.label/.test(String(err))) {
        throw new Error(`Já existe uma conta com o apelido "${input.label.trim()}" — escolha outro nome.`);
      }
      throw err;
    }
    const account = (await this.listAccounts()).find((a) => a.id === id)!;
    this.emit('account:updated', account);
    this.#queue.kick();
    return account;
  }

  async removeAccount(id: string): Promise<void> {
    const parts = this.#db
      .prepare('SELECT COUNT(*) AS n FROM file_parts WHERE account_id = ?')
      .get(id) as { n: number };
    if (parts.n > 0) {
      throw new Error(
        `Esta conta ainda guarda ${parts.n} arquivo(s). Exclua os arquivos antes de remover a conta.`,
      );
    }
    transaction(this.#db, () => {
      this.#db.prepare('DELETE FROM jobs WHERE account_id = ?').run(id);
      this.#db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
    });
    this.emit('account:updated', { id } as AccountInfo);
  }

  /** Re-establishes access to an account. For Google Drive this redoes the
   *  full browser consent (also upgrading scopes when the app's scope set
   *  changed); for password providers it just retries the stored login. */
  async reconnectAccount(id: string): Promise<void> {
    const row = this.#db
      .prepare('SELECT provider, auth_blob FROM accounts WHERE id = ?')
      .get(id) as { provider: string; auth_blob: Uint8Array } | undefined;
    if (!row) throw new Error('Conta não encontrada');

    if (row.provider === 'gdrive') {
      const creds = JSON.parse(
        this.#opts.cipher.decrypt(Buffer.from(row.auth_blob)),
      ) as Credentials;
      const provider = this.#registry.get('gdrive');
      const fresh = await provider.authorize(
        { kind: 'oauth', clientId: creds.client_id!, clientSecret: creds.client_secret! },
        this.#opts.openUrl,
      );
      this.#db
        .prepare('UPDATE accounts SET auth_blob = ? WHERE id = ?')
        .run(this.#opts.cipher.encrypt(JSON.stringify(fresh)), id);
    }

    this.#db.prepare("UPDATE accounts SET status = 'active' WHERE id = ?").run(id);
    this.#sessions.invalidate(id);
    this.#emitAccount(id);
    this.#queue.kick();
  }

  async reconcileAccount(accountId: string): Promise<void> {
    this.#insertJob({ type: 'reconcile_account', accountId });
    this.#queue.kick();
  }

  // ── Virtual tree ───────────────────────────────────────────────────────────

  async listChildren(parentId: string): Promise<NodeInfo[]> {
    return vfs.listChildren(this.#db, parentId);
  }

  async getNode(id: string): Promise<NodeInfo | null> {
    return vfs.getNode(this.#db, id);
  }

  async createFolder(parentId: string, name: string): Promise<NodeInfo> {
    const node = vfs.createFolder(this.#db, parentId, name);
    this.emit('tree:changed', { parentId });
    return node;
  }

  async renameNode(id: string, newName: string): Promise<void> {
    const node = vfs.getNode(this.#db, id);
    if (!node) throw new Error('Item não encontrado');
    vfs.renameNode(this.#db, id, newName);
    this.emit('tree:changed', { parentId: node.parentId });
  }

  async deleteNodes(ids: string[]): Promise<void> {
    const parents = new Set<string>();
    for (const id of ids) {
      const node = vfs.getNode(this.#db, id);
      if (node) parents.add(node.parentId);
    }
    const subtree = vfs.collectSubtree(this.#db, ids);

    // Uploads still in flight for these nodes: cancel via the queue (it owns
    // staging cleanup and will delete the node row itself).
    const uploadJobs = this.#db
      .prepare(
        `SELECT id FROM jobs WHERE type = 'upload_part' AND state IN ('queued','running')
          AND node_id IN (${subtree.map(() => '?').join(',') || "''"})`,
      )
      .all(...subtree) as Array<{ id: string }>;
    for (const j of uploadJobs) this.#queue.cancelJob(j.id);

    const parts = vfs.collectUploadedParts(this.#db, subtree);
    transaction(this.#db, () => {
      for (const part of parts) {
        this.#insertJob({
          type: 'delete_remote',
          accountId: part.accountId,
          payload: { remoteRef: part.remoteRef, size: part.size },
        });
      }
      // Children before parents (FK): collectSubtree pushes parents first.
      for (const nodeId of [...subtree].reverse()) {
        this.#db.prepare('DELETE FROM nodes WHERE id = ?').run(nodeId);
      }
    });
    for (const parentId of parents) this.emit('tree:changed', { parentId });
    this.#queue.kick();
  }

  // ── Transfers ──────────────────────────────────────────────────────────────

  async uploadFiles(parentId: string, filePaths: string[]): Promise<void> {
    await mkdir(this.#opts.stagingDir, { recursive: true });
    const errors: string[] = [];
    for (const filePath of filePaths) {
      try {
        await this.#ingestOne(parentId, filePath);
      } catch (err) {
        errors.push(`${basename(filePath)}: ${err instanceof Error ? err.message : err}`);
      }
    }
    this.emit('tree:changed', { parentId });
    this.#queue.kick();
    if (errors.length) throw new Error(errors.join('\n'));
  }

  async #ingestOne(parentId: string, filePath: string): Promise<void> {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('não é um arquivo');
    const size = info.size;
    const jobId = randomUUID();
    const nodeId = randomUUID();
    const partId = randomUUID();
    const staged = join(this.#opts.stagingDir, jobId);
    await copyFile(filePath, staged);

    try {
      transaction(this.#db, () => {
        const accountId = choosePlacement(this.#db, size);
        const now = Date.now();
        const name = vfs.uniqueName(this.#db, parentId, basename(filePath));
        const mime = mimeFor(filePath);
        this.#db
          .prepare(
            `INSERT INTO nodes (id, parent_id, kind, name, size, mime, status, created_at, updated_at)
             VALUES (?, ?, 'file', ?, ?, ?, 'uploading', ?, ?)`,
          )
          .run(nodeId, parentId, name, size, mime, now, now);
        this.#db
          .prepare(
            `INSERT INTO file_parts (id, node_id, part_index, size, hash, account_id, created_at)
             VALUES (?, ?, 0, ?, '', ?, ?)`,
          )
          .run(partId, nodeId, size, accountId, now);
        this.#db
          .prepare(
            `INSERT INTO jobs (id, type, state, node_id, part_id, account_id, reserved_bytes, local_path, created_at, updated_at)
             VALUES (?, 'upload_part', 'queued', ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(jobId, nodeId, partId, accountId, size, staged, now, now);
      });
      this.#emitJob(jobId);
    } catch (err) {
      await rm(staged, { force: true });
      throw err;
    }
  }

  /** Double-click behavior: materialize the file in the user's Downloads
   *  folder (real name, visible) and open it with the default app. Returns
   *  where it landed and whether a new copy was written. */
  async openNode(nodeId: string): Promise<{ path: string; downloaded: boolean }> {
    const cachePath = await this.#ensureCached(nodeId);
    const node = vfs.getNode(this.#db, nodeId)!;
    const target = await this.#materializeInDownloads(cachePath, node.name, node.size);
    await this.#opts.openFile?.(target.path);
    return { path: target.path, downloaded: target.copied };
  }

  /** Downloads (or copies from cache) a file node to a user-chosen path. */
  async saveNodeTo(nodeId: string, targetPath: string): Promise<void> {
    const path = await this.#ensureCached(nodeId);
    await copyFile(path, targetPath);
  }

  /** Copies the cached file into Downloads under its real name. Reuses an
   *  existing copy when name+size match; otherwise picks "name (2).ext". */
  async #materializeInDownloads(
    cachePath: string,
    name: string,
    size: number,
  ): Promise<{ path: string; copied: boolean }> {
    await mkdir(this.#opts.downloadsDir, { recursive: true });
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    for (let i = 1; ; i++) {
      const candidate = join(this.#opts.downloadsDir, i === 1 ? name : `${base} (${i})${ext}`);
      if (!existsSync(candidate)) {
        await copyFile(cachePath, candidate);
        return { path: candidate, copied: true };
      }
      if ((await stat(candidate)).size === size) {
        return { path: candidate, copied: false };
      }
    }
  }

  /** Resolves with the cached file path, downloading it first if needed. */
  async #ensureCached(nodeId: string): Promise<string> {
    const node = vfs.getNode(this.#db, nodeId);
    if (!node || node.kind !== 'file') throw new Error('Item não é um arquivo');
    if (node.status === 'uploading') throw new Error('Aguarde o upload terminar');
    if (node.status === 'missing_remote') throw new Error('Arquivo não está mais na nuvem — reconcilie a conta');

    const part = this.#db
      .prepare('SELECT * FROM file_parts WHERE node_id = ? AND part_index = 0')
      .get(nodeId) as { id: string; account_id: string; hash: string } | undefined;
    if (!part) throw new Error('Arquivo sem partes — metadados corrompidos');

    const ext = extname(node.name);
    const cachedPathFor = (hash: string) => join(this.#opts.cacheDir, `${hash}${ext}`);
    if (part.hash && existsSync(cachedPathFor(part.hash))) return cachedPathFor(part.hash);

    // Reuse an in-flight download for this part, or start one.
    const existing = this.#db
      .prepare(
        "SELECT id FROM jobs WHERE type = 'download_part' AND part_id = ? AND state IN ('queued','running')",
      )
      .get(part.id) as { id: string } | undefined;
    const jobId =
      existing?.id ??
      this.#insertJob({
        type: 'download_part',
        nodeId,
        partId: part.id,
        accountId: part.account_id,
      });
    this.#queue.kick();
    await this.#waitJob(jobId);

    const freshHash = (
      this.#db.prepare('SELECT hash FROM file_parts WHERE id = ?').get(part.id) as { hash: string }
    ).hash;
    const path = cachedPathFor(freshHash);
    if (!existsSync(path)) throw new Error('Download terminou mas o arquivo não está no cache');
    return path;
  }

  /** Polls a job until it settles; rejects on failed/canceled. */
  async #waitJob(jobId: string, timeoutMs = 30 * 60 * 1000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const job = this.#queue.getJob(jobId);
      if (!job) throw new Error('Transferência desapareceu');
      if (job.state === 'done') return;
      if (job.state === 'failed') throw new Error(job.last_error ?? 'Transferência falhou');
      if (job.state === 'canceled') throw new Error('Transferência cancelada');
      if (job.state === 'queued' && job.account_id) {
        const acc = this.#db
          .prepare('SELECT status FROM accounts WHERE id = ?')
          .get(job.account_id) as { status: string } | undefined;
        if (acc && acc.status !== 'active') {
          throw new Error('Conta precisa ser reconectada — veja o painel de contas');
        }
      }
      if (Date.now() > deadline) throw new Error('Transferência excedeu o tempo limite');
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  async listJobs(): Promise<JobInfo[]> {
    const rows = this.#db
      .prepare(`${JOB_SELECT} ORDER BY j.created_at DESC LIMIT 100`)
      .all() as unknown as JobInfoRow[];
    return rows.map(toJobInfo);
  }

  async cancelJob(jobId: string): Promise<void> {
    this.#queue.cancelJob(jobId);
  }

  async retryJob(jobId: string): Promise<void> {
    this.#queue.retryJob(jobId);
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  #insertJob(spec: {
    type: JobInfo['type'];
    nodeId?: string;
    partId?: string;
    accountId?: string;
    localPath?: string;
    payload?: unknown;
  }): string {
    const id = randomUUID();
    const now = Date.now();
    this.#db
      .prepare(
        `INSERT INTO jobs (id, type, state, node_id, part_id, account_id, local_path, payload, created_at, updated_at)
         VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        spec.type,
        spec.nodeId ?? null,
        spec.partId ?? null,
        spec.accountId ?? null,
        spec.localPath ?? null,
        spec.payload !== undefined ? JSON.stringify(spec.payload) : null,
        now,
        now,
      );
    this.#emitJob(id);
    return id;
  }

  #emitJob(jobId: string): void {
    const info = this.#db.prepare(JOB_SELECT_ONE).get(jobId) as JobInfoRow | undefined;
    if (info) this.emit('job:updated', toJobInfo(info));
  }

  #emitAccount(accountId: string): void {
    void this.listAccounts().then((accounts) => {
      const account = accounts.find((a) => a.id === accountId);
      if (account) this.emit('account:updated', account);
    });
  }
}

const JOB_SELECT = `
  SELECT j.id, j.type, j.state, j.node_id, j.account_id, j.progress_bytes,
         j.last_error, j.created_at,
         n.name AS node_name, COALESCE(p.size, 0) AS total_bytes
    FROM jobs j
    LEFT JOIN nodes n ON n.id = j.node_id
    LEFT JOIN file_parts p ON p.id = j.part_id`;

const JOB_SELECT_ONE = `${JOB_SELECT} WHERE j.id = ?`;

interface JobInfoRow {
  id: string;
  type: JobInfo['type'];
  state: JobInfo['state'];
  node_id: string | null;
  account_id: string | null;
  progress_bytes: number;
  last_error: string | null;
  created_at: number;
  node_name: string | null;
  total_bytes: number;
}

function toJobInfo(r: JobInfoRow): JobInfo {
  return {
    id: r.id,
    type: r.type,
    state: r.state,
    nodeId: r.node_id,
    nodeName: r.node_name,
    accountId: r.account_id,
    progressBytes: r.progress_bytes,
    totalBytes: r.total_bytes,
    lastError: r.last_error,
    createdAt: r.created_at,
  };
}
