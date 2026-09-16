import type { ProviderId, StorageProvider } from './provider.js';
import { MegaProvider } from './mega/mega-provider.js';
import { GDriveProvider } from './gdrive/gdrive-provider.js';

export class ProviderRegistry {
  #providers = new Map<ProviderId, StorageProvider>();

  constructor(extra: StorageProvider[] = []) {
    this.register(new MegaProvider());
    this.register(new GDriveProvider());
    for (const p of extra) this.register(p);
  }

  register(provider: StorageProvider): void {
    this.#providers.set(provider.id, provider);
  }

  get(id: string): StorageProvider {
    const provider = this.#providers.get(id as ProviderId);
    if (!provider) throw new Error(`Provider desconhecido: ${id}`);
    return provider;
  }
}
