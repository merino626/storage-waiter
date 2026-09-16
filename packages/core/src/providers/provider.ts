import type { Readable } from 'node:stream';

export type ProviderId = 'mega' | 'gdrive' | 'fake';

/** JSON-serializable credential bag; persisted encrypted in accounts.auth_blob. */
export type Credentials = Record<string, string>;

export interface Quota {
  totalBytes: number;
  usedBytes: number;
}

export interface RemoteObject {
  remoteRef: string;
  name: string;
  size: number;
}

export interface UploadOptions {
  /** Remote object name — the user's real file name (it's their cloud; the
   *  file must stay usable there). Reconcile maps remote→local by remoteRef. */
  name: string;
  size: number;
  onProgress?: (bytesSent: number) => void;
  signal?: AbortSignal;
}

export interface DownloadOptions {
  onProgress?: (bytesReceived: number) => void;
  signal?: AbortSignal;
}

/** A live, authenticated connection to one account. */
export interface ProviderSession {
  quota(): Promise<Quota>;
  upload(data: Readable, opts: UploadOptions): Promise<{ remoteRef: string }>;
  download(remoteRef: string, opts?: DownloadOptions): Promise<Readable>;
  /** Must be idempotent: deleting an already-gone object resolves normally. */
  delete(remoteRef: string): Promise<void>;
  /** Objects inside the app's remote folder — used by reconcile. */
  listAppObjects(): Promise<RemoteObject[]>;
}

export type AuthInput =
  | { kind: 'password'; email: string; password: string }
  | { kind: 'oauth'; clientId: string; clientSecret: string }
  | { kind: 'none' };

/** Stateless factory for one provider type. */
export interface StorageProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  /** Interactive first-time auth. Returns the credentials to encrypt+persist. */
  authorize(input: AuthInput, openUrl: (url: string) => Promise<void>): Promise<Credentials>;
  /** Opens a session from stored credentials. Throws AuthExpiredError if they
   *  no longer work. If the provider rotates credentials (e.g. a new refresh
   *  token), it calls onCredentialsUpdated so the caller re-encrypts them. */
  connect(
    creds: Credentials,
    onCredentialsUpdated: (c: Credentials) => Promise<void>,
  ): Promise<ProviderSession>;
}

/** Remote folder name used by every provider to hold this app's objects. */
export const APP_REMOTE_FOLDER = 'StorageWaiter';
