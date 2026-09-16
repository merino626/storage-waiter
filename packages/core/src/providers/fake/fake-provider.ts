import { Readable } from 'node:stream';
import { AuthExpiredError } from '../../util/errors.js';
import type {
  Credentials,
  DownloadOptions,
  ProviderSession,
  Quota,
  RemoteObject,
  StorageProvider,
  UploadOptions,
} from '../provider.js';

/** In-memory backend shared across sessions AND CoreService restarts, so
 *  crash-recovery tests can reopen the same "cloud". Supports fault injection. */
export class FakeBackend {
  objects = new Map<string, { name: string; data: Buffer }>();
  quotaTotalBytes: number;
  baseUsedBytes = 0;
  seq = 0;
  /** Fault injection */
  failNextUpload: Error | null = null;
  latencyMs = 0;
  authExpired = false;
  /** When true, delete() throws for absent objects instead of no-op'ing —
   *  simulates providers whose session state lags the real cloud. */
  strictDelete = false;
  /** When set, quota() reports this instead of reality (exercises reconcile). */
  quotaLiesUsedBytes: number | null = null;

  constructor(quotaTotalBytes = 1024 * 1024 * 1024) {
    this.quotaTotalBytes = quotaTotalBytes;
  }

  realUsedBytes(): number {
    let sum = this.baseUsedBytes;
    for (const o of this.objects.values()) sum += o.data.length;
    return sum;
  }
}

class FakeSession implements ProviderSession {
  constructor(private backend: FakeBackend) {}

  async #delay(): Promise<void> {
    if (this.backend.latencyMs > 0) {
      await new Promise((r) => setTimeout(r, this.backend.latencyMs));
    }
  }

  async quota(): Promise<Quota> {
    return {
      totalBytes: this.backend.quotaTotalBytes,
      usedBytes: this.backend.quotaLiesUsedBytes ?? this.backend.realUsedBytes(),
    };
  }

  async upload(data: Readable, opts: UploadOptions): Promise<{ remoteRef: string }> {
    if (this.backend.authExpired) throw new AuthExpiredError('fake');
    await this.#delay();
    if (this.backend.failNextUpload) {
      const err = this.backend.failNextUpload;
      this.backend.failNextUpload = null;
      data.destroy();
      throw err;
    }
    const chunks: Buffer[] = [];
    let sent = 0;
    for await (const chunk of data) {
      if (opts.signal?.aborted) throw new Error('aborted');
      const buf = Buffer.from(chunk as Buffer);
      chunks.push(buf);
      sent += buf.length;
      opts.onProgress?.(sent);
      await this.#delay();
    }
    const buffer = Buffer.concat(chunks);
    if (this.backend.realUsedBytes() + buffer.length > this.backend.quotaTotalBytes) {
      throw new Error('fake: quota exceeded');
    }
    const remoteRef = `fake-${++this.backend.seq}-${opts.name}`;
    this.backend.objects.set(remoteRef, { name: opts.name, data: buffer });
    return { remoteRef };
  }

  async download(remoteRef: string, opts?: DownloadOptions): Promise<Readable> {
    if (this.backend.authExpired) throw new AuthExpiredError('fake');
    await this.#delay();
    const obj = this.backend.objects.get(remoteRef);
    if (!obj) throw new Error(`fake: object not found: ${remoteRef}`);
    opts?.onProgress?.(obj.data.length);
    return Readable.from(obj.data);
  }

  async delete(remoteRef: string): Promise<void> {
    await this.#delay();
    if (this.backend.strictDelete && !this.backend.objects.has(remoteRef)) {
      throw new Error(`fake: object not found: ${remoteRef}`);
    }
    this.backend.objects.delete(remoteRef);
  }

  async listAppObjects(): Promise<RemoteObject[]> {
    return [...this.backend.objects.entries()].map(([remoteRef, o]) => ({
      remoteRef,
      name: o.name,
      size: o.data.length,
    }));
  }
}

export class FakeProvider implements StorageProvider {
  readonly id = 'fake' as const;
  readonly displayName = 'Fake (testes)';
  /** Set before addAccount() to bind the next account to a named backend. */
  nextBackendId = 'default';

  constructor(readonly backends: Record<string, FakeBackend> = { default: new FakeBackend() }) {}

  #backend(id: string): FakeBackend {
    const backend = this.backends[id];
    if (!backend) throw new Error(`fake: backend desconhecido: ${id}`);
    return backend;
  }

  async authorize(): Promise<Credentials> {
    return { backend_id: this.nextBackendId };
  }

  async connect(creds: Credentials): Promise<ProviderSession> {
    const backend = this.#backend(creds.backend_id ?? 'default');
    if (backend.authExpired) throw new AuthExpiredError('fake');
    return new FakeSession(backend);
  }
}
