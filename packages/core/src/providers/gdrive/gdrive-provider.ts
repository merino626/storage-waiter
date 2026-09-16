import type { Readable } from 'node:stream';
import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import { drive as driveApi, type drive_v3 } from '@googleapis/drive';
import { AuthExpiredError } from '../../util/errors.js';
import { runLoopbackFlow } from './oauth-loopback.js';
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

/** Full Drive scope. drive.file (files created by the app) would be enough
 *  for uploads, but reconcile must SEE files the user drops into the
 *  StorageWaiter folder via the Drive site — invisible under drive.file.
 *  Each user runs their own OAuth client (testing mode), so Google's
 *  restricted-scope verification does not apply. The app still only ever
 *  touches the StorageWaiter folder, by code. */
const SCOPE = 'https://www.googleapis.com/auth/drive';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

function isInvalidGrant(err: unknown): boolean {
  const e = err as { response?: { data?: { error?: string } }; message?: string };
  return e?.response?.data?.error === 'invalid_grant' || /invalid_grant/.test(e?.message ?? '');
}

class GDriveSession implements ProviderSession {
  #folderId: string | null = null;

  constructor(
    private drive: drive_v3.Drive,
    private label: string,
  ) {}

  async #appFolderId(): Promise<string> {
    if (this.#folderId) return this.#folderId;
    try {
      const res = await this.drive.files.list({
        q: `name='${APP_REMOTE_FOLDER}' and mimeType='${FOLDER_MIME}' and trashed=false`,
        fields: 'files(id)',
      });
      const existing = res.data.files?.[0]?.id;
      if (existing) {
        this.#folderId = existing;
        return existing;
      }
      const created = await this.drive.files.create({
        requestBody: { name: APP_REMOTE_FOLDER, mimeType: FOLDER_MIME },
        fields: 'id',
      });
      this.#folderId = created.data.id!;
      return this.#folderId;
    } catch (err) {
      if (isInvalidGrant(err)) throw new AuthExpiredError(this.label, err);
      throw err;
    }
  }

  async quota(): Promise<Quota> {
    try {
      const res = await this.drive.about.get({ fields: 'storageQuota' });
      const q = res.data.storageQuota;
      return {
        totalBytes: Number(q?.limit ?? 0),
        usedBytes: Number(q?.usage ?? 0),
      };
    } catch (err) {
      if (isInvalidGrant(err)) throw new AuthExpiredError(this.label, err);
      throw err;
    }
  }

  async upload(data: Readable, opts: UploadOptions): Promise<{ remoteRef: string }> {
    const folderId = await this.#appFolderId();
    try {
      const res = await this.drive.files.create(
        {
          requestBody: { name: opts.name, parents: [folderId] },
          media: { body: data },
          fields: 'id',
        },
        {
          signal: opts.signal,
          onUploadProgress: (e: { bytesRead: number }) => opts.onProgress?.(e.bytesRead),
        },
      );
      return { remoteRef: res.data.id! };
    } catch (err) {
      if (isInvalidGrant(err)) throw new AuthExpiredError(this.label, err);
      throw err;
    }
  }

  async download(remoteRef: string, opts?: DownloadOptions): Promise<Readable> {
    try {
      const res = await this.drive.files.get(
        { fileId: remoteRef, alt: 'media' },
        { responseType: 'stream', signal: opts?.signal },
      );
      const stream = res.data as Readable;
      if (opts?.onProgress) {
        let received = 0;
        stream.on('data', (chunk: Buffer) => {
          received += chunk.length;
          opts.onProgress!(received);
        });
      }
      return stream;
    } catch (err) {
      if (isInvalidGrant(err)) throw new AuthExpiredError(this.label, err);
      throw err;
    }
  }

  async delete(remoteRef: string): Promise<void> {
    try {
      await this.drive.files.delete({ fileId: remoteRef });
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) return; // already gone — idempotent
      if (isInvalidGrant(err)) throw new AuthExpiredError(this.label, err);
      throw err;
    }
  }

  async listAppObjects(): Promise<RemoteObject[]> {
    const folderId = await this.#appFolderId();
    const objects: RemoteObject[] = [];
    let pageToken: string | undefined;
    do {
      const res = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'nextPageToken, files(id, name, size)',
        pageSize: 1000,
        pageToken,
      });
      for (const f of res.data.files ?? []) {
        objects.push({ remoteRef: f.id!, name: f.name ?? '', size: Number(f.size ?? 0) });
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return objects;
  }
}

export class GDriveProvider implements StorageProvider {
  readonly id = 'gdrive' as const;
  readonly displayName = 'Google Drive';

  async authorize(
    input: AuthInput,
    openUrl: (url: string) => Promise<void>,
  ): Promise<Credentials> {
    if (input.kind !== 'oauth') throw new Error('Google Drive requer OAuth (client ID/secret)');
    const client = new OAuth2Client({ clientId: input.clientId, clientSecret: input.clientSecret });
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();

    const { code, redirectUri } = await runLoopbackFlow(
      (redirect) =>
        client.generateAuthUrl({
          access_type: 'offline',
          prompt: 'consent',
          scope: SCOPE,
          redirect_uri: redirect,
          code_challenge_method: CodeChallengeMethod.S256,
          code_challenge: codeChallenge,
        }),
      openUrl,
    );

    const { tokens } = await client.getToken({ code, codeVerifier, redirect_uri: redirectUri });
    if (!tokens.refresh_token) {
      throw new Error('Google não retornou refresh_token — remova o acesso do app em myaccount.google.com/permissions e tente de novo');
    }
    return {
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: tokens.refresh_token,
    };
  }

  async connect(
    creds: Credentials,
    onCredentialsUpdated: (c: Credentials) => Promise<void>,
  ): Promise<ProviderSession> {
    const client = new OAuth2Client({
      clientId: creds.client_id,
      clientSecret: creds.client_secret,
    });
    client.setCredentials({ refresh_token: creds.refresh_token });
    client.on('tokens', (tokens) => {
      if (tokens.refresh_token && tokens.refresh_token !== creds.refresh_token) {
        void onCredentialsUpdated({ ...creds, refresh_token: tokens.refresh_token });
      }
    });
    const drive = driveApi({ version: 'v3', auth: client });
    const session = new GDriveSession(drive, creds.client_id ?? 'gdrive');
    // Validate the stored refresh token now so a revoked account surfaces
    // as AuthExpiredError at connect time, not mid-transfer.
    await session.quota();
    // Validate granted scopes: a token issued before a scope change would
    // "work" but silently see less than the app needs (e.g. reconcile-import
    // can't see user-dropped files without the full drive scope).
    try {
      const { token } = await client.getAccessToken();
      if (token) {
        const info = await client.getTokenInfo(token);
        if (!(info.scopes ?? []).includes(SCOPE)) {
          throw new AuthExpiredError(
            creds.client_id ?? 'gdrive',
            new Error('token sem o escopo necessário — reautorize a conta'),
          );
        }
      }
    } catch (err) {
      if (err instanceof AuthExpiredError) throw err;
      if (isInvalidGrant(err)) throw new AuthExpiredError(creds.client_id ?? 'gdrive', err);
      throw err;
    }
    return session;
  }
}
