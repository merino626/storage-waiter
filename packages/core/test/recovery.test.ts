import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { FakeBackend } from '../src/providers/fake/fake-provider.js';
import { AuthExpiredError } from '../src/util/errors.js';
import { createTestEnv, makeTempFile, type TestEnv } from './helpers.js';

const GiB = 1024 * 1024 * 1024;

let env: TestEnv;
afterEach(() => env?.cleanup());

describe('crash recovery', () => {
  it('requeues an interrupted upload after restart and completes it', async () => {
    const backend = new FakeBackend(2 * GiB);
    env = await createTestEnv({ default: backend });
    await env.core.addAccount({ provider: 'fake', label: 'nuvem-1' });

    // Slow the fake cloud down so the upload is mid-flight when we "crash".
    backend.latencyMs = 200;
    const src = makeTempFile(env.dir, 'meio.bin', 64 * 1024);
    await env.core.uploadFiles('root', [src]);
    await new Promise((r) => setTimeout(r, 80)); // job já está running

    const running = env.core.db
      .prepare("SELECT COUNT(*) AS n FROM jobs WHERE state = 'running'")
      .get() as { n: number };
    expect(running.n).toBe(1);

    // "Crash": rebuild the service over the same db + staging dir.
    backend.latencyMs = 0;
    const core2 = await env.restart();
    await core2.waitForIdle();

    const [node] = await core2.listChildren('root');
    expect(node!.status).toBe('ready');
    expect(backend.objects.size).toBe(1);
    const remote = [...backend.objects.values()][0]!;
    expect(remote.data.equals(readFileSync(src))).toBe(true);
  });

  it('parks jobs when auth expires and resumes after reconnect', async () => {
    const backend = new FakeBackend(2 * GiB);
    env = await createTestEnv({ default: backend });
    const account = await env.core.addAccount({ provider: 'fake', label: 'nuvem-1' });

    backend.authExpired = true;
    const src = makeTempFile(env.dir, 'preso.bin', 8 * 1024);
    await env.core.uploadFiles('root', [src]);
    await env.core.waitForIdle(); // idle porque o job está estacionado

    const accounts = await env.core.listAccounts();
    expect(accounts[0]!.status).toBe('auth_expired');
    const job = (await env.core.listJobs()).find((j) => j.type === 'upload_part')!;
    expect(job.state).toBe('queued'); // estacionado, não falhado

    backend.authExpired = false;
    await env.core.reconnectAccount(account.id);
    await env.core.waitForIdle();

    const [node] = await env.core.listChildren('root');
    expect(node!.status).toBe('ready');
  });

  it('AuthExpiredError is a typed error', () => {
    expect(new AuthExpiredError('x')).toBeInstanceOf(Error);
  });
});

async function waitUntil(predicate: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('waitUntil: tempo esgotado');
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('startup account verification', () => {
  it('flags accounts that lost access even before any transfer', async () => {
    const backend = new FakeBackend(2 * GiB);
    env = await createTestEnv({ default: backend });
    await env.core.addAccount({ provider: 'fake', label: 'nuvem-1' });
    expect((await env.core.listAccounts())[0]!.status).toBe('active');

    backend.authExpired = true; // acesso revogado enquanto o app estava fechado
    const core2 = await env.restart();

    await waitUntil(async () => (await core2.listAccounts())[0]!.status === 'auth_expired');
  });

  it('heals accounts that regained access', async () => {
    const backend = new FakeBackend(2 * GiB);
    env = await createTestEnv({ default: backend });
    const account = await env.core.addAccount({ provider: 'fake', label: 'nuvem-1' });

    // Estado salvo como expirado, mas o acesso voltou a funcionar:
    env.core.db.prepare("UPDATE accounts SET status = 'auth_expired' WHERE id = ?").run(account.id);
    const core2 = await env.restart();

    await waitUntil(async () => (await core2.listAccounts())[0]!.status === 'active');
  });
});
