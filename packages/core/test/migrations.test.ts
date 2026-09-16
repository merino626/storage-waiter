import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, transaction } from '../src/db/database.js';
import { schemaVersion } from '../src/db/migrations.js';
import { CoreService, PlaintextCipher, CORE_VERSION } from '../src/index.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sw-test-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

describe('migrations', () => {
  it('creates the full schema and the fixed root node', () => {
    const db = openDatabase(join(tempDir(), 'test.db'));
    cleanups.push(() => db.close());

    expect(schemaVersion(db)).toBe(3);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toEqual(
      expect.arrayContaining(['accounts', 'nodes', 'file_parts', 'jobs', 'settings']),
    );

    const root = db.prepare("SELECT * FROM nodes WHERE id = 'root'").get() as {
      parent_id: string;
      kind: string;
    };
    expect(root.parent_id).toBe('root');
    expect(root.kind).toBe('folder');
  });

  it('is idempotent: reopening the same db does not re-run migrations', () => {
    const dbPath = join(tempDir(), 'test.db');
    const db1 = openDatabase(dbPath);
    db1.close();
    const db2 = openDatabase(dbPath); // would throw "table already exists" if re-run
    cleanups.push(() => db2.close());
    expect(schemaVersion(db2)).toBe(3);
  });

  it('rejects duplicate names under the same parent (root included)', () => {
    const db = openDatabase(join(tempDir(), 'test.db'));
    cleanups.push(() => db.close());
    const insert = db.prepare(
      "INSERT INTO nodes (id, parent_id, kind, name, created_at, updated_at) VALUES (?, 'root', 'folder', ?, 0, 0)",
    );
    insert.run('a', 'Docs');
    expect(() => insert.run('b', 'Docs')).toThrow();
  });

  it('transaction() rolls back on error', () => {
    const db = openDatabase(join(tempDir(), 'test.db'));
    cleanups.push(() => db.close());
    expect(() =>
      transaction(db, () => {
        db.prepare(
          "INSERT INTO nodes (id, parent_id, kind, name, created_at, updated_at) VALUES ('x', 'root', 'folder', 'X', 0, 0)",
        ).run();
        throw new Error('boom');
      }),
    ).toThrow('boom');
    const row = db.prepare("SELECT COUNT(*) AS n FROM nodes WHERE id = 'x'").get() as { n: number };
    expect(row.n).toBe(0);
  });
});

describe('CoreService', () => {
  it('boots, reports status, and encrypts via the injected cipher', async () => {
    const dir = tempDir();
    const core = new CoreService({
      dbPath: join(dir, 'sw.db'),
      cacheDir: join(dir, 'cache'),
      stagingDir: join(dir, 'staging'),
      downloadsDir: join(dir, 'downloads'),
      cipher: new PlaintextCipher(),
      openUrl: async () => {},
    });
    cleanups.push(() => core.close());

    const status = await core.getStatus();
    expect(status.coreVersion).toBe(CORE_VERSION);
    expect(status.schemaVersion).toBe(3);
    expect(status.accountCount).toBe(0);

    const blob = core.cipher.encrypt('{"secret":"x"}');
    expect(core.cipher.decrypt(blob)).toBe('{"secret":"x"}');
  });
});
