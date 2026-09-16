import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { CoreService, PlaintextCipher } from '../src/index.js';
import { FakeBackend, FakeProvider } from '../src/providers/fake/fake-provider.js';

export interface TestEnv {
  dir: string;
  downloadsDir: string;
  core: CoreService;
  fake: FakeProvider;
  openedFiles: string[];
  restart(): Promise<CoreService>;
  cleanup(): void;
}

/** Boots a CoreService over temp dirs with a FakeProvider bound to the given
 *  backends. restart() simulates a crash: closes nothing gracefully in the
 *  queue sense — it just builds a fresh service on the same db/dirs. */
export async function createTestEnv(
  backends: Record<string, FakeBackend> = { default: new FakeBackend() },
): Promise<TestEnv> {
  const dir = mkdtempSync(join(tmpdir(), 'sw-core-'));
  const downloadsDir = join(dir, 'downloads');
  const openedFiles: string[] = [];
  const fake = new FakeProvider(backends);

  const build = () =>
    new CoreService({
      dbPath: join(dir, 'sw.db'),
      cacheDir: join(dir, 'cache'),
      stagingDir: join(dir, 'staging'),
      downloadsDir,
      cipher: new PlaintextCipher(),
      openUrl: async () => {},
      openFile: async (path) => {
        openedFiles.push(path);
      },
      providers: [fake],
      retryBaseMs: 5,
      verifyIntervalMs: 0,
    });

  let core = build();
  await core.start();

  return {
    dir,
    downloadsDir,
    get core() {
      return core;
    },
    fake,
    openedFiles,
    async restart() {
      core.close();
      core = build();
      await core.start();
      return core;
    },
    cleanup() {
      try {
        core.close();
      } catch {
        /* already closed */
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function makeTempFile(dir: string, name: string, bytes: number): string {
  const path = join(dir, name);
  writeFileSync(path, randomBytes(bytes));
  return path;
}
