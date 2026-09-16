import { safeStorage } from 'electron';
import type { SecretCipher } from '@storagewaiter/core';

/** DPAPI-backed cipher (Windows) via Electron safeStorage.
 *  Must only be constructed after app.whenReady(). */
export class SafeStorageCipher implements SecretCipher {
  constructor() {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('safeStorage encryption is not available on this system');
    }
  }
  encrypt(plaintext: string): Buffer {
    return safeStorage.encryptString(plaintext);
  }
  decrypt(blob: Buffer): string {
    return safeStorage.decryptString(blob);
  }
}
