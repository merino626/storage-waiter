import type { Readable } from 'node:stream';
import { Storage } from 'megajs';
import { AuthExpiredError } from '../../util/errors.js';
import {
  APP_REMOTE_FOLDER,
  type AuthInput,
  type Credentials,
  type DownloadOptions,
  type ProviderSession,
  type Quota,
  type RemoteObject,
  type StorageProvider,
  type UploadOptions,
} from '../provider.js';

const USER_AGENT = 'StorageWaiter/0.1';

/** Credential problems (wrong email/password, blocked account) — these and
 *  ONLY these may flag the account as auth_expired. */
function isCredentialError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /ENOENT|EFAILED|EACCESS|EBLOCKED|wrong password|invalid email/i.test(msg);
}

/** Transient throttling by Mega (per-IP), typical after many logins in a row
 *  (e.g. dev restarts). Must surface as a clear, retryable error. */
function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /ETOOMANY|EAGAIN|ERATELIMIT|too many/i.test(msg);
}

async function login(email: string, password: string): Promise<Storage> {
  try {
    return await new Storage({ email, password, userAgent: USER_AGENT }).ready;
  } catch (err) {
    if (isRateLimitError(err)) {
      throw new Error(
        'O Mega limitou temporariamente os logins deste IP (muitas tentativas seguidas). Aguarde alguns minutos e tente de novo.',
      );
    }
    if (isCredentialError(err)) throw new AuthExpiredError(email, err);
    throw err instanceof Error ? err : new Error(String(err));
  }
}

async function ensureAppFolder(storage: Storage) {
  const children = storage.root.children ?? [];
  const existing = children.find((f) => f.directory && f.name === APP_REMOTE_FOLDER);
  if (existing) return existing;
  return storage.mkdir({ name: APP_REMOTE_FOLDER });
}

class MegaSession implements ProviderSession {
  constructor(
    private storage: Storage,
    private folder: Awaited<ReturnType<typeof ensureAppFolder>>,
  ) {}

  async quota(): Promise<Quota> {
    const info = await this.storage.getAccountInfo();
    return { totalBytes: info.spaceTotal ?? 0, usedBytes: info.spaceUsed ?? 0 };
  }

  async upload(data: Readable, opts: UploadOptions): Promise<{ remoteRef: string }> {
    // megajs takes the payload by piping into the returned upload stream.
    const up = this.folder.upload({ name: opts.name, size: opts.size });
    data.pipe(up);
    if (opts.onProgress) {
      up.on('progress', (stats: { bytesUploaded: number }) => {
        opts.onProgress!(stats.bytesUploaded);
      });
    }
    if (opts.signal) {
      opts.signal.addEventListener('abort', () => data.destroy(new Error('aborted')), {
        once: true,
      });
    }
    const file = await up.complete;
    return { remoteRef: file.nodeId! };
  }

  async download(remoteRef: string, opts?: DownloadOptions): Promise<Readable> {
    const file = this.storage.files[remoteRef];
    if (!file) throw new Error(`Mega: objeto não encontrado: ${remoteRef}`);
    const stream = file.download({});
    if (opts?.onProgress) {
      let received = 0;
      stream.on('data', (chunk: Buffer) => {
        received += chunk.length;
        opts.onProgress!(received);
      });
    }
    return stream;
  }

  async delete(remoteRef: string): Promise<void> {
    const file = this.storage.files[remoteRef];
    if (!file) return; // already gone — idempotent
    try {
      await file.delete(true);
    } catch (err) {
      // Session state can lag behind the real cloud (file removed via the
      // Mega site after we connected): ENOENT here means "already deleted".
      const msg = err instanceof Error ? err.message : String(err);
      if (!/ENOENT|not found/i.test(msg)) throw err;
    }
  }

  async listAppObjects(): Promise<RemoteObject[]> {
    const children = this.folder.children ?? [];
    return children
      .filter((f) => !f.directory)
      .map((f) => ({ remoteRef: f.nodeId!, name: f.name ?? '', size: f.size ?? 0 }));
  }
}

export class MegaProvider implements StorageProvider {
  readonly id = 'mega' as const;
  readonly displayName = 'Mega';

  async authorize(input: AuthInput): Promise<Credentials> {
    if (input.kind !== 'password') throw new Error('Mega requer e-mail e senha');
    // No login here: addAccount connects right after, and Mega rate-limits
    // logins per IP — one validation login is enough.
    return { email: input.email, password: input.password };
  }

  async connect(creds: Credentials): Promise<ProviderSession> {
    const storage = await login(creds.email!, creds.password!);
    const folder = await ensureAppFolder(storage);
    return new MegaSession(storage, folder);
  }
}
