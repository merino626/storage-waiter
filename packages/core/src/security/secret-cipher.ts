/** Encrypts credentials at rest. Core never touches Electron: the app injects
 *  a SafeStorageCipher (DPAPI via Electron safeStorage); tests inject
 *  PlaintextCipher; a future headless runner can inject an AES-GCM cipher. */
export interface SecretCipher {
  encrypt(plaintext: string): Buffer;
  decrypt(blob: Buffer): string;
}

/** For tests only — stores secrets as-is. */
export class PlaintextCipher implements SecretCipher {
  encrypt(plaintext: string): Buffer {
    return Buffer.from(plaintext, 'utf8');
  }
  decrypt(blob: Buffer): string {
    return blob.toString('utf8');
  }
}
