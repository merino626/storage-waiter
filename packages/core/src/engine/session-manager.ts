import type { Database } from '../db/database.js';
import type { SecretCipher } from '../security/secret-cipher.js';
import type { Credentials, ProviderSession } from '../providers/provider.js';
import type { ProviderRegistry } from '../providers/registry.js';
import { AuthExpiredError } from '../util/errors.js';

interface AccountRow {
  id: string;
  provider: string;
  label: string;
  auth_blob: Uint8Array;
  status: string;
}

/** Caches one live ProviderSession per account; decrypts credentials on
 *  demand and re-encrypts them if the provider rotates tokens. */
export class SessionManager {
  #sessions = new Map<string, Promise<ProviderSession>>();

  constructor(
    private db: Database,
    private cipher: SecretCipher,
    private registry: ProviderRegistry,
    private onAuthExpired: (accountId: string) => void,
  ) {}

  async getSession(accountId: string): Promise<ProviderSession> {
    const cached = this.#sessions.get(accountId);
    if (cached) return cached;

    const promise = this.#connect(accountId);
    this.#sessions.set(accountId, promise);
    promise.catch(() => this.#sessions.delete(accountId));
    return promise;
  }

  async #connect(accountId: string): Promise<ProviderSession> {
    const row = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId) as
      | AccountRow
      | undefined;
    if (!row) throw new Error(`Conta não encontrada: ${accountId}`);

    const creds = JSON.parse(this.cipher.decrypt(Buffer.from(row.auth_blob))) as Credentials;
    const provider = this.registry.get(row.provider);
    try {
      return await provider.connect(creds, async (updated) => {
        const blob = this.cipher.encrypt(JSON.stringify(updated));
        this.db.prepare('UPDATE accounts SET auth_blob = ? WHERE id = ?').run(blob, accountId);
      });
    } catch (err) {
      if (err instanceof AuthExpiredError) this.onAuthExpired(accountId);
      throw err;
    }
  }

  invalidate(accountId: string): void {
    this.#sessions.delete(accountId);
  }

  clear(): void {
    this.#sessions.clear();
  }
}
