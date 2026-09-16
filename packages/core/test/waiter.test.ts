import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db/database.js';
import { choosePlacement, headroom } from '../src/engine/waiter.js';
import { InsufficientSpaceError } from '../src/util/errors.js';

const GiB = 1024 * 1024 * 1024;
const MiB = 1024 * 1024;

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sw-waiter-'));
  const db = openDatabase(join(dir, 't.db'));
  cleanups.push(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return db;
}

function addAccount(db: ReturnType<typeof makeDb>, id: string, total: number, used: number, status = 'active') {
  db.prepare(
    `INSERT INTO accounts (id, provider, label, auth_blob, quota_total, quota_used, status, created_at)
     VALUES (?, 'fake', ?, X'00', ?, ?, ?, 0)`,
  ).run(id, id, total, used, status);
}

function addReservation(db: ReturnType<typeof makeDb>, accountId: string, bytes: number) {
  db.prepare(
    `INSERT INTO jobs (id, type, state, account_id, reserved_bytes, created_at, updated_at)
     VALUES (?, 'upload_part', 'queued', ?, ?, 0, 0)`,
  ).run(`job-${accountId}-${bytes}`, accountId, bytes);
}

describe('waiter placement', () => {
  it('picks the account with the most effective free space', () => {
    const db = makeDb();
    addAccount(db, 'small', 15 * GiB, 10 * GiB); // 5 GiB free
    addAccount(db, 'big', 20 * GiB, 2 * GiB); // 18 GiB free
    expect(choosePlacement(db, 100 * MiB)).toBe('big');
  });

  it('counts pending reservations against free space', () => {
    const db = makeDb();
    addAccount(db, 'a', 20 * GiB, 0); // 20 GiB free
    addAccount(db, 'b', 15 * GiB, 0); // 15 GiB free
    addReservation(db, 'a', 10 * GiB); // a agora tem 10 GiB efetivos
    expect(choosePlacement(db, 1 * GiB)).toBe('b');
  });

  it('ignores inactive accounts', () => {
    const db = makeDb();
    addAccount(db, 'expired', 20 * GiB, 0, 'auth_expired');
    addAccount(db, 'ok', 15 * GiB, 0);
    expect(choosePlacement(db, 1 * GiB)).toBe('ok');
  });

  it('requires headroom beyond the file size', () => {
    const db = makeDb();
    // 500 MiB free, file of 400 MiB + 200 MiB headroom = 600 MiB needed
    addAccount(db, 'tight', 1 * GiB, 524 * MiB);
    expect(() => choosePlacement(db, 400 * MiB)).toThrow(InsufficientSpaceError);
  });

  it('throws when no account fits', () => {
    const db = makeDb();
    expect(() => choosePlacement(db, 1)).toThrow(InsufficientSpaceError);
  });

  it('headroom is max(200MiB, 2%)', () => {
    expect(headroom(1 * MiB)).toBe(200 * MiB);
    expect(headroom(100 * GiB)).toBe(2 * GiB);
  });
});
