import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sha256File } from '../src/util/hash.js';
import { FakeBackend } from '../src/providers/fake/fake-provider.js';
import { createTestEnv, makeTempFile, type TestEnv } from './helpers.js';

const GiB = 1024 * 1024 * 1024;

let env: TestEnv;
afterEach(() => env?.cleanup());

describe('upload pipeline', () => {
  it('uploads a file end-to-end: node ready, part uploaded, bytes match', async () => {
    const backend = new FakeBackend(2 * GiB);
    env = await createTestEnv({ default: backend });
    await env.core.addAccount({ provider: 'fake', label: 'nuvem-1' });

    const src = makeTempFile(env.dir, 'doc.bin', 64 * 1024);
    const expectedHash = await sha256File(src);
    await env.core.uploadFiles('root', [src]);
    await env.core.waitForIdle();

    const [node] = await env.core.listChildren('root');
    expect(node!.status).toBe('ready');
    expect(node!.name).toBe('doc.bin');
    expect(node!.accountLabel).toBe('nuvem-1');

    // The remote object holds exactly the source bytes.
    const remote = [...backend.objects.values()][0]!;
    expect(remote.data.equals(readFileSync(src))).toBe(true);

    const part = env.core.db
      .prepare('SELECT * FROM file_parts WHERE node_id = ?')
      .get(node!.id) as { status: string; hash: string; remote_ref: string };
    expect(part.status).toBe('uploaded');
    expect(part.hash).toBe(expectedHash);
    // The remote object keeps the user's real file name.
    expect(remote.name).toBe('doc.bin');
    expect(part.remote_ref).toContain('doc.bin');
  });

  it('places the file on the account with most free space', async () => {
    const big = new FakeBackend(20 * GiB);
    const small = new FakeBackend(2 * GiB);
    env = await createTestEnv({ big, small });

    env.fake.nextBackendId = 'big';
    await env.core.addAccount({ provider: 'fake', label: 'conta-grande' });
    env.fake.nextBackendId = 'small';
    await env.core.addAccount({ provider: 'fake', label: 'conta-pequena' });

    const src = makeTempFile(env.dir, 'x.bin', 8 * 1024);
    await env.core.uploadFiles('root', [src]);
    await env.core.waitForIdle();

    const [node] = await env.core.listChildren('root');
    expect(node!.accountLabel).toBe('conta-grande');
    expect(big.objects.size).toBe(1);
    expect(small.objects.size).toBe(0);
  });

  it('double-click downloads into the Downloads folder with the real name and opens it', async () => {
    const backend = new FakeBackend(2 * GiB);
    env = await createTestEnv({ default: backend });
    await env.core.addAccount({ provider: 'fake', label: 'nuvem-1' });

    const src = makeTempFile(env.dir, 'foto.png', 32 * 1024);
    const original = readFileSync(src);
    await env.core.uploadFiles('root', [src]);
    await env.core.waitForIdle();

    const [node] = await env.core.listChildren('root');
    const first = await env.core.openNode(node!.id);

    expect(first.downloaded).toBe(true);
    expect(first.path).toBe(join(env.downloadsDir, 'foto.png'));
    expect(env.openedFiles).toEqual([first.path]);
    expect(readFileSync(first.path).equals(original)).toBe(true);

    // Second open: reuses the Downloads copy — no new job, no duplicate file.
    const jobsBefore = (await env.core.listJobs()).length;
    const second = await env.core.openNode(node!.id);
    expect(second.downloaded).toBe(false);
    expect(second.path).toBe(first.path);
    expect((await env.core.listJobs()).length).toBe(jobsBefore);
    expect(readdirSync(env.downloadsDir)).toEqual(['foto.png']);
  });

  it('retries failed uploads and succeeds', async () => {
    const backend = new FakeBackend(2 * GiB);
    env = await createTestEnv({ default: backend });
    await env.core.addAccount({ provider: 'fake', label: 'nuvem-1' });

    backend.failNextUpload = new Error('rede caiu');
    const src = makeTempFile(env.dir, 'a.bin', 8 * 1024);
    await env.core.uploadFiles('root', [src]);
    await env.core.waitForIdle();

    const [node] = await env.core.listChildren('root');
    expect(node!.status).toBe('ready'); // second attempt worked
    const job = (await env.core.listJobs()).find((j) => j.type === 'upload_part')!;
    expect(job.state).toBe('done');
  });

  it('marks the file failed after exhausting attempts', async () => {
    const backend = new FakeBackend(2 * GiB);
    env = await createTestEnv({ default: backend });
    await env.core.addAccount({ provider: 'fake', label: 'nuvem-1' });

    // fail forever: re-arm on every read by monkeypatching upload
    const src = makeTempFile(env.dir, 'b.bin', 8 * 1024);
    backend.authExpired = false;
    const origSet = backend.objects.set.bind(backend.objects);
    backend.objects.set = () => {
      throw new Error('disco remoto quebrado');
    };
    await env.core.uploadFiles('root', [src]);
    await env.core.waitForIdle(20_000);
    backend.objects.set = origSet;

    const [node] = await env.core.listChildren('root');
    expect(node!.status).toBe('failed');
    const job = (await env.core.listJobs()).find((j) => j.type === 'upload_part')!;
    expect(job.state).toBe('failed');
    expect(job.lastError).toContain('disco remoto quebrado');
  });

  it('deleting a file enqueues remote deletion and frees quota', async () => {
    const backend = new FakeBackend(2 * GiB);
    env = await createTestEnv({ default: backend });
    await env.core.addAccount({ provider: 'fake', label: 'nuvem-1' });

    const src = makeTempFile(env.dir, 'del.bin', 16 * 1024);
    await env.core.uploadFiles('root', [src]);
    await env.core.waitForIdle();
    expect(backend.objects.size).toBe(1);

    const [node] = await env.core.listChildren('root');
    await env.core.deleteNodes([node!.id]);
    await env.core.waitForIdle();

    expect(await env.core.listChildren('root')).toHaveLength(0);
    expect(backend.objects.size).toBe(0);
  });

  it('insufficient space fails the ingest with a clear error', async () => {
    const backend = new FakeBackend(1024); // 1 KiB de nuvem
    env = await createTestEnv({ default: backend });
    await env.core.addAccount({ provider: 'fake', label: 'mini' });

    const src = makeTempFile(env.dir, 'grande.bin', 64 * 1024);
    await expect(env.core.uploadFiles('root', [src])).rejects.toThrow(/free space|espaço/i);
    expect(await env.core.listChildren('root')).toHaveLength(0);
  });

  it('reconcile imports files added to the cloud by hand', async () => {
    const backend = new FakeBackend(2 * GiB);
    env = await createTestEnv({ default: backend });
    const account = await env.core.addAccount({ provider: 'fake', label: 'nuvem-1' });

    // Usuário subiu direto pela interface da nuvem:
    const data = Buffer.from('conteudo colocado por fora');
    backend.objects.set('ext-123', { name: 'da-nuvem.txt', data });

    await env.core.reconcileAccount(account.id);
    await env.core.waitForIdle();

    const [node] = await env.core.listChildren('root');
    expect(node!.name).toBe('da-nuvem.txt');
    expect(node!.status).toBe('ready');
    expect(node!.size).toBe(data.length);
    expect(node!.accountLabel).toBe('nuvem-1');

    // Abrir baixa para Downloads com o nome real e adota o hash.
    const opened = await env.core.openNode(node!.id);
    expect(opened.downloaded).toBe(true);
    expect(opened.path).toBe(join(env.downloadsDir, 'da-nuvem.txt'));
    expect(env.openedFiles).toEqual([opened.path]);
    expect(readFileSync(opened.path).equals(data)).toBe(true);

    const part = env.core.db
      .prepare('SELECT hash FROM file_parts WHERE node_id = ?')
      .get(node!.id) as { hash: string };
    expect(part.hash).toHaveLength(64); // sha256 adotado no primeiro download

    // Reconciliar de novo não duplica.
    await env.core.reconcileAccount(account.id);
    await env.core.waitForIdle();
    expect(await env.core.listChildren('root')).toHaveLength(1);
  });

  it('reconcile marks remotely-deleted files as missing; deleting them fires no cloud request', async () => {
    const backend = new FakeBackend(2 * GiB);
    env = await createTestEnv({ default: backend });
    const account = await env.core.addAccount({ provider: 'fake', label: 'nuvem-1' });

    const src = makeTempFile(env.dir, 'sumiu.bin', 8 * 1024);
    await env.core.uploadFiles('root', [src]);
    await env.core.waitForIdle();

    backend.objects.clear(); // apagado "por fora"
    backend.strictDelete = true; // qualquer delete remoto agora explodiria
    await env.core.reconcileAccount(account.id);
    await env.core.waitForIdle();

    const [node] = await env.core.listChildren('root');
    expect(node!.status).toBe('missing_remote');

    // Excluir um arquivo "sumido" só limpa a lista: nenhum job de delete.
    await env.core.deleteNodes([node!.id]);
    await env.core.waitForIdle();
    expect(await env.core.listChildren('root')).toHaveLength(0);
    const deleteJobs = (await env.core.listJobs()).filter((j) => j.type === 'delete_remote');
    expect(deleteJobs).toHaveLength(0);
  });

  it('delete tolerates providers whose session lags the cloud (already-gone object)', async () => {
    const backend = new FakeBackend(2 * GiB);
    env = await createTestEnv({ default: backend });
    await env.core.addAccount({ provider: 'fake', label: 'nuvem-1' });

    const src = makeTempFile(env.dir, 'defasado.bin', 8 * 1024);
    await env.core.uploadFiles('root', [src]);
    await env.core.waitForIdle();

    // Apagado por fora SEM reconciliar: a parte ainda consta 'uploaded',
    // então o delete remoto é enfileirado — e o provider "estrito" lança.
    backend.objects.clear();
    backend.strictDelete = true;

    const [node] = await env.core.listChildren('root');
    await env.core.deleteNodes([node!.id]);
    await env.core.waitForIdle();

    expect(await env.core.listChildren('root')).toHaveLength(0);
    const job = (await env.core.listJobs()).find((j) => j.type === 'delete_remote')!;
    expect(job.state).toBe('done'); // "já não existe lá" conta como sucesso
  });
});

describe('virtual tree', () => {
  it('folders: create, rename, unique names, delete', async () => {
    env = await createTestEnv();
    const docs = await env.core.createFolder('root', 'Documentos');
    const dup = await env.core.createFolder('root', 'Documentos');
    expect(dup.name).toBe('Documentos (2)');

    await env.core.renameNode(dup.id, 'Fotos');
    const names = (await env.core.listChildren('root')).map((n) => n.name);
    expect(names).toEqual(['Documentos', 'Fotos']);

    await env.core.deleteNodes([docs.id]);
    expect((await env.core.listChildren('root')).map((n) => n.name)).toEqual(['Fotos']);
  });
});
