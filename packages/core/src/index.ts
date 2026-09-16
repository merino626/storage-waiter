export { CoreService, CORE_VERSION, type CoreServiceOptions } from './core-service.js';
export type { SecretCipher } from './security/secret-cipher.js';
export { PlaintextCipher } from './security/secret-cipher.js';
export { AuthExpiredError, InsufficientSpaceError } from './util/errors.js';
export * from './api-types.js';
export type {
  StorageProvider,
  ProviderSession,
  AuthInput,
  Credentials,
  Quota,
  RemoteObject,
} from './providers/provider.js';
export { FakeProvider, FakeBackend } from './providers/fake/fake-provider.js';
