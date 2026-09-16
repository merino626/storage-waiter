import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Database } from '../db/database.js';
import { transaction } from '../db/database.js';
import { sha256File } from '../util/hash.js';
import { mimeFor } from '../util/mime.js';
import { AuthExpiredError } from '../util/errors.js';
import type { SessionManager } from './session-manager.js';

export interface JobRow {
  id: string;
  type: 'upload_part' | 'download_part' | 'delete_remote' | 'reconcile_account';
  state: 'queued' | 'running' | 'done' | 'failed' | 'canceled';
  node_id: string | null;
  part_id: string | null;
  account_id: string | null;
  attempts: number;
  max_attempts: number;
  reserved_bytes: number;
  local_path: string | null;
  progress_bytes: number;
  last_error: string | null;
  payload: string | null;
  created_at: number;
  updated_at: number;
}

export interface JobQueueDeps {
  db: Database;
  sessions: SessionManager;
  cacheDir: string;
  stagingDir: string;
  /** Base retry delay; tests pass a small value. Default 5000ms. */
  retryBaseMs?: number;
  maxConcurrent?: number;
  onJobUpdated: (jobId: string) => void;
  onAccountUpdated: (accountId: string) => void;
  onTreeChanged: (parentId: string) => void;
}

export class JobQueue {
  #db: Database;
  #deps: Required<Pick<JobQueueDeps, 'retryBaseMs' | 'maxConcurrent'>> & JobQueueDeps;
  #running = new Map<string, AbortController>();
  #nextRetryAt = new Map<string, number>();
  #timers = new Set<ReturnType<typeof setTimeout>>();
  #stopped = false;

  constructor(deps: JobQueueDeps) {
    this.#db = deps.db;
    this.#deps = { retryBaseMs: 5000, maxConcurrent: 2, ...deps };
  }

  /** Crash recovery + cleanup, then start scheduling. */
  async start(): Promise<void> {
    await mkdir(this.#deps.stagingDir, { recursive: true });
    await mkdir(this.#deps.cacheDir, { recursive: true });

    this.#db
      .prepare(
        "UPDATE jobs SET state = 'queued', progress_bytes = 0, updated_at = ? WHERE state = 'running'",
      )
      .run(Date.now());

    // Staging files not referenced by any live upload job are orphans.
    const liveStaging = new Set(
      (
        this.#db
          .prepare("SELECT local_path FROM jobs WHERE type = 'upload_part' AND state = 'queued'")
          .all() as Array<{ local_path: string | null }>
      )
        .map((r) => r.local_path)
        .filter((p): p is string => p !== null),
    );
    for (const entry of await readdir(this.#deps.stagingDir)) {
      const full = join(this.#deps.stagingDir, entry);
      if (!liveStaging.has(full)) await rm(full, { force: true });
    }
    for (const entry of await readdir(this.#deps.cacheDir)) {
      if (entry.endsWith('.partial')) await rm(join(this.#deps.cacheDir, entry), { force: true });
    }

    this.kick();
  }

  stop(): void {
    this.#stopped = true;
    for (const t of this.#timers) clearTimeout(t);
    this.#timers.clear();
    for (const ac of this.#running.values()) ac.abort();
  }

  getJob(jobId: string): JobRow | undefined {
    return this.#db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as JobRow | undefined;
  }

  /** Schedules as many runnable jobs as concurrency allows. */
  kick(): void {
    if (this.#stopped) return;
    const now = Date.now();
    const candidates = this.#db
      .prepare(
        `SELECT j.* FROM jobs j
          LEFT JOIN accounts a ON a.id = j.account_id
         WHERE j.state = 'queued' AND (j.account_id IS NULL OR a.status = 'active')
         ORDER BY j.created_at`,
      )
      .all() as unknown as JobRow[];

    const busyAccounts = new Set<string>();
    for (const [id] of this.#running) {
      const row = this.getJob(id);
      if (row?.account_id) busyAccounts.add(row.account_id);
    }

    let earliestRetry = Infinity;
    for (const job of candidates) {
      if (this.#running.size >= this.#deps.maxConcurrent) break;
      if (this.#running.has(job.id)) continue;
      const retryAt = this.#nextRetryAt.get(job.id) ?? 0;
      if (retryAt > now) {
        earliestRetry = Math.min(earliestRetry, retryAt);
        continue;
      }
      if (job.account_id && busyAccounts.has(job.account_id)) continue;
      if (job.account_id) busyAccounts.add(job.account_id);
      this.#launch(job);
    }

    if (earliestRetry !== Infinity) {
      const timer = setTimeout(() => {
        this.#timers.delete(timer);
        this.kick();
      }, earliestRetry - now + 10);
      this.#timers.add(timer);
    }
  }

  /** Resolves when nothing is running and nothing runnable remains queued. */
  async waitForIdle(timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const pending = this.#db
        .prepare(
          `SELECT COUNT(*) AS n FROM jobs j
            LEFT JOIN accounts a ON a.id = j.account_id
           WHERE j.state = 'running'
              OR (j.state = 'queued' AND (j.account_id IS NULL OR a.status = 'active'))`,
        )
        .get() as { n: number };
      if (pending.n === 0 && this.#running.size === 0) return;
      if (Date.now() > deadline) throw new Error(`waitForIdle: ${pending.n} jobs pendentes`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  cancelJob(jobId: string): void {
    const job = this.getJob(jobId);
    if (!job) return;
    const ac = this.#running.get(jobId);
    if (ac) {
      ac.abort(); // runner does the cleanup
      return;
    }
    if (job.state === 'queued') void this.#cleanupCanceled(job);
  }

  retryJob(jobId: string): void {
    const job = this.getJob(jobId);
    if (!job || job.state !== 'failed') return;
    const reserve = job.type === 'upload_part' ? this.#partSize(job.part_id) : 0;
    transaction(this.#db, () => {
      this.#db
        .prepare(
          "UPDATE jobs SET state = 'queued', attempts = 0, last_error = NULL, reserved_bytes = ?, updated_at = ? WHERE id = ?",
        )
        .run(reserve, Date.now(), jobId);
      if (job.type === 'upload_part' && job.node_id) {
        this.#db
          .prepare("UPDATE nodes SET status = 'uploading', updated_at = ? WHERE id = ?")
          .run(Date.now(), job.node_id);
      }
    });
    this.#nextRetryAt.delete(jobId);
    this.#deps.onJobUpdated(jobId);
    this.kick();
  }

  #partSize(partId: string | null): number {
    if (!partId) return 0;
    const row = this.#db.prepare('SELECT size FROM file_parts WHERE id = ?').get(partId) as
      | { size: number }
      | undefined;
    return row?.size ?? 0;
  }

  #setState(jobId: string, state: JobRow['state'], extra: Record<string, unknown> = {}): void {
    const sets = ['state = ?', 'updated_at = ?', ...Object.keys(extra).map((k) => `${k} = ?`)];
    this.#db
      .prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`)
      .run(state, Date.now(), ...(Object.values(extra) as never[]), jobId);
    this.#deps.onJobUpdated(jobId);
  }

  #launch(job: JobRow): void {
    const ac = new AbortController();
    this.#running.set(job.id, ac);
    this.#setState(job.id, 'running');

    void this.#run(job, ac.signal)
      .catch(async (err: unknown) => {
        // Shutdown abort is NOT a cancel: the job stays 'running' in the db
        // so the next start() requeues it (crash-recovery semantics).
        if (this.#stopped) return;
        return this.#handleFailure(job, err, ac.signal.aborted);
      })
      .catch(() => {
        /* db already closed during shutdown — recovery handles it */
      })
      .finally(() => {
        this.#running.delete(job.id);
        this.kick();
      });
  }

  async #run(job: JobRow, signal: AbortSignal): Promise<void> {
    switch (job.type) {
      case 'upload_part':
        return this.#runUpload(job, signal);
      case 'download_part':
        return this.#runDownload(job, signal);
      case 'delete_remote':
        return this.#runDelete(job);
      case 'reconcile_account':
        return this.#runReconcile(job);
    }
  }

  async #handleFailure(job: JobRow, err: unknown, aborted: boolean): Promise<void> {
    if (aborted) {
      await this.#cleanupCanceled(job);
      return;
    }
    if (err instanceof AuthExpiredError) {
      // Park the job (stays queued); the account was already flagged by
      // SessionManager.onAuthExpired, so kick() will skip it until reconnect.
      this.#setState(job.id, 'queued', { progress_bytes: 0, last_error: err.message });
      return;
    }
    const attempts = job.attempts + 1;
    const message = err instanceof Error ? err.message : String(err);
    if (attempts >= job.max_attempts) {
      transaction(this.#db, () => {
        this.#setState(job.id, 'failed', {
          attempts,
          last_error: message,
          reserved_bytes: 0,
          progress_bytes: 0,
        });
        if (job.type === 'upload_part' && job.node_id) {
          this.#db
            .prepare("UPDATE nodes SET status = 'failed', updated_at = ? WHERE id = ?")
            .run(Date.now(), job.node_id);
        }
      });
      this.#emitTreeForNode(job.node_id);
    } else {
      const delay = this.#deps.retryBaseMs * 2 ** attempts;
      this.#nextRetryAt.set(job.id, Date.now() + delay);
      this.#setState(job.id, 'queued', { attempts, last_error: message, progress_bytes: 0 });
    }
  }

  async #cleanupCanceled(job: JobRow): Promise<void> {
    if (job.type === 'upload_part') {
      // A canceled upload removes the virtual file entirely.
      const parentId = this.#nodeParent(job.node_id);
      transaction(this.#db, () => {
        if (job.node_id) this.#db.prepare('DELETE FROM nodes WHERE id = ?').run(job.node_id);
        this.#setState(job.id, 'canceled', { reserved_bytes: 0 });
      });
      if (job.local_path) await rm(job.local_path, { force: true });
      if (parentId) this.#deps.onTreeChanged(parentId);
    } else {
      if (job.type === 'download_part' && job.part_id) {
        await rm(join(this.#deps.cacheDir, `${job.part_id}.partial`), { force: true });
      }
      this.#setState(job.id, 'canceled');
    }
  }

  #nodeParent(nodeId: string | null): string | null {
    if (!nodeId) return null;
    const row = this.#db.prepare('SELECT parent_id FROM nodes WHERE id = ?').get(nodeId) as
      | { parent_id: string }
      | undefined;
    return row?.parent_id ?? null;
  }

  #emitTreeForNode(nodeId: string | null): void {
    const parent = this.#nodeParent(nodeId);
    if (parent) this.#deps.onTreeChanged(parent);
  }

  #throttledProgress(jobId: string): (bytes: number) => void {
    let lastWrite = 0;
    return (bytes: number) => {
      const now = Date.now();
      if (now - lastWrite < 400) return;
      lastWrite = now;
      this.#db
        .prepare('UPDATE jobs SET progress_bytes = ?, updated_at = ? WHERE id = ?')
        .run(bytes, now, jobId);
      this.#deps.onJobUpdated(jobId);
    };
  }

  // ── Runners ────────────────────────────────────────────────────────────────

  async #runUpload(job: JobRow, signal: AbortSignal): Promise<void> {
    const part = this.#db.prepare('SELECT * FROM file_parts WHERE id = ?').get(job.part_id) as
      | { id: string; node_id: string; size: number; hash: string; account_id: string }
      | undefined;
    if (!part || !job.local_path) {
      // Node was deleted while queued — nothing to upload.
      this.#setState(job.id, 'canceled', { reserved_bytes: 0 });
      if (job.local_path) await rm(job.local_path, { force: true });
      return;
    }

    let hash = part.hash;
    if (!hash) {
      hash = await sha256File(job.local_path);
      transaction(this.#db, () => {
        this.#db.prepare('UPDATE file_parts SET hash = ? WHERE id = ?').run(hash, part.id);
        this.#db
          .prepare('UPDATE nodes SET content_hash = ?, updated_at = ? WHERE id = ?')
          .run(hash, Date.now(), part.node_id);
      });
    }

    // The remote object keeps the user's real file name — it's their cloud,
    // the file must be usable there too. Mapping back is done by remote_ref.
    const nodeName = (
      this.#db.prepare('SELECT name FROM nodes WHERE id = ?').get(part.node_id) as
        | { name: string }
        | undefined
    )?.name;
    const session = await this.#deps.sessions.getSession(part.account_id);
    const { remoteRef } = await session.upload(createReadStream(job.local_path), {
      name: nodeName ?? part.id,
      size: part.size,
      signal,
      onProgress: this.#throttledProgress(job.id),
    });
    if (signal.aborted) {
      await session.delete(remoteRef).catch(() => {});
      throw new Error('aborted');
    }

    transaction(this.#db, () => {
      this.#db
        .prepare("UPDATE file_parts SET remote_ref = ?, status = 'uploaded' WHERE id = ?")
        .run(remoteRef, part.id);
      this.#db
        .prepare("UPDATE nodes SET status = 'ready', updated_at = ? WHERE id = ?")
        .run(Date.now(), part.node_id);
      this.#db
        .prepare('UPDATE accounts SET quota_used = COALESCE(quota_used, 0) + ? WHERE id = ?')
        .run(part.size, part.account_id);
      this.#setState(job.id, 'done', { progress_bytes: part.size, reserved_bytes: 0 });
    });
    await rm(job.local_path, { force: true });
    this.#deps.onAccountUpdated(part.account_id);
    this.#emitTreeForNode(part.node_id);
  }

  async #runDownload(job: JobRow, signal: AbortSignal): Promise<void> {
    const part = this.#db.prepare('SELECT * FROM file_parts WHERE id = ?').get(job.part_id) as
      | { id: string; node_id: string; size: number; hash: string; account_id: string; remote_ref: string | null }
      | undefined;
    if (!part?.remote_ref) throw new Error('Parte sem referência remota — arquivo ainda subindo?');
    const node = this.#db.prepare('SELECT name FROM nodes WHERE id = ?').get(part.node_id) as
      | { name: string }
      | undefined;
    const ext = extname(node?.name ?? '');
    const partialPath = join(this.#deps.cacheDir, `${part.id}.partial`);

    const session = await this.#deps.sessions.getSession(part.account_id);
    let stream;
    try {
      stream = await session.download(part.remote_ref, {
        signal,
        onProgress: this.#throttledProgress(job.id),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/not found|não encontrado|404/i.test(msg)) {
        // Deleted remotely out-of-band: mark broken, never silently drop metadata.
        transaction(this.#db, () => {
          this.#db.prepare("UPDATE file_parts SET status = 'missing' WHERE id = ?").run(part.id);
          this.#db
            .prepare("UPDATE nodes SET status = 'missing_remote', updated_at = ? WHERE id = ?")
            .run(Date.now(), part.node_id);
          this.#setState(job.id, 'failed', { last_error: 'Arquivo removido na nuvem', reserved_bytes: 0 });
        });
        this.#emitTreeForNode(part.node_id);
        return;
      }
      throw err;
    }

    const hasher = createHash('sha256');
    stream.on('data', (chunk: Buffer) => hasher.update(chunk));
    await pipeline(stream, createWriteStream(partialPath), { signal });

    const digest = hasher.digest('hex');
    if (part.hash && digest !== part.hash) {
      await rm(partialPath, { force: true });
      throw new Error(`Integridade falhou: hash ${digest.slice(0, 8)}… ≠ esperado ${part.hash.slice(0, 8)}…`);
    }
    if (!part.hash) {
      // Imported file downloaded for the first time: adopt its hash now.
      transaction(this.#db, () => {
        this.#db.prepare('UPDATE file_parts SET hash = ? WHERE id = ?').run(digest, part.id);
        this.#db
          .prepare('UPDATE nodes SET content_hash = ?, updated_at = ? WHERE id = ?')
          .run(digest, Date.now(), part.node_id);
      });
    }

    // Content-addressed cache, extension kept so Windows opens the right app.
    const cachePath = join(this.#deps.cacheDir, `${digest}${ext}`);
    await rm(cachePath, { force: true });
    await rename(partialPath, cachePath);
    this.#setState(job.id, 'done', { progress_bytes: part.size, local_path: cachePath });
  }

  async #runDelete(job: JobRow): Promise<void> {
    const payload = JSON.parse(job.payload ?? '{}') as { remoteRef?: string; size?: number };
    if (payload.remoteRef && job.account_id) {
      const session = await this.#deps.sessions.getSession(job.account_id);
      try {
        await session.delete(payload.remoteRef);
      } catch (err) {
        // Deleting something already gone is success, whatever the provider
        // says (sessions can hold stale listings of the remote folder).
        const msg = err instanceof Error ? err.message : String(err);
        if (!/not found|não encontrado|404|ENOENT/i.test(msg)) throw err;
      }
      this.#db
        .prepare('UPDATE accounts SET quota_used = MAX(0, COALESCE(quota_used, 0) - ?) WHERE id = ?')
        .run(payload.size ?? 0, job.account_id);
      this.#deps.onAccountUpdated(job.account_id);
    }
    this.#setState(job.id, 'done');
  }

  async #runReconcile(job: JobRow): Promise<void> {
    const accountId = job.account_id!;
    const session = await this.#deps.sessions.getSession(accountId);

    const quota = await session.quota();
    const remote = await session.listAppObjects();
    const remoteRefs = new Set(remote.map((o) => o.remoteRef));

    const parts = this.#db
      .prepare(
        "SELECT id, node_id, remote_ref FROM file_parts WHERE account_id = ? AND status = 'uploaded'",
      )
      .all(accountId) as Array<{ id: string; node_id: string; remote_ref: string | null }>;

    // ALL refs this app knows for this account (any status), so an object
    // mid-upload is never treated as foreign.
    const knownRefs = new Set(
      (
        this.#db
          .prepare('SELECT remote_ref FROM file_parts WHERE account_id = ? AND remote_ref IS NOT NULL')
          .all(accountId) as unknown as Array<{ remote_ref: string }>
      ).map((r) => r.remote_ref),
    );

    let imported = 0;
    transaction(this.#db, () => {
      for (const part of parts) {
        if (part.remote_ref && !remoteRefs.has(part.remote_ref)) {
          this.#db.prepare("UPDATE file_parts SET status = 'missing' WHERE id = ?").run(part.id);
          this.#db
            .prepare("UPDATE nodes SET status = 'missing_remote', updated_at = ? WHERE id = ?")
            .run(Date.now(), part.node_id);
        }
      }

      // Files the user put in the cloud's StorageWaiter folder by hand:
      // import them into the virtual tree (root) instead of ignoring them.
      const nameTaken = this.#db.prepare('SELECT 1 FROM nodes WHERE parent_id = ? AND name = ?');
      for (const obj of remote) {
        if (knownRefs.has(obj.remoteRef)) continue;
        const now = Date.now();
        let name = obj.name || obj.remoteRef;
        if (nameTaken.get('root', name)) {
          const dot = name.lastIndexOf('.');
          const base = dot > 0 ? name.slice(0, dot) : name;
          const ext = dot > 0 ? name.slice(dot) : '';
          for (let i = 2; nameTaken.get('root', name); i++) name = `${base} (${i})${ext}`;
        }
        const nodeId = randomUUID();
        this.#db
          .prepare(
            `INSERT INTO nodes (id, parent_id, kind, name, size, mime, status, created_at, updated_at)
             VALUES (?, 'root', 'file', ?, ?, ?, 'ready', ?, ?)`,
          )
          .run(nodeId, name, obj.size, mimeFor(name), now, now);
        this.#db
          .prepare(
            `INSERT INTO file_parts (id, node_id, part_index, size, hash, account_id, remote_ref, status, created_at)
             VALUES (?, ?, 0, ?, '', ?, ?, 'uploaded', ?)`,
          )
          .run(randomUUID(), nodeId, obj.size, accountId, obj.remoteRef, now);
        imported += 1;
      }

      this.#db
        .prepare('UPDATE accounts SET quota_total = ?, quota_used = ?, last_reconciled_at = ? WHERE id = ?')
        .run(quota.totalBytes, quota.usedBytes, Date.now(), accountId);
      this.#setState(job.id, 'done', { payload: JSON.stringify({ imported }) });
    });
    this.#deps.onAccountUpdated(accountId);
    this.#deps.onTreeChanged('root');
  }
}
