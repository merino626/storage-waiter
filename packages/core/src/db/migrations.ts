import type { DatabaseSync } from 'node:sqlite';
import { MIGRATION_001_INIT } from './migrations/001_init.js';
import { MIGRATION_002_JOB_PAYLOAD } from './migrations/002_job_payload.js';
import { MIGRATION_003_ACCOUNT_VERIFIED_AT } from './migrations/003_account_verified_at.js';

/** Ordered list; index 0 brings user_version to 1, and so on.
 *  Migrations are TS string constants (not .sql files) so they survive
 *  bundling into the Electron main process without asset copying. */
const MIGRATIONS: readonly string[] = [
  MIGRATION_001_INIT,
  MIGRATION_002_JOB_PAYLOAD,
  MIGRATION_003_ACCOUNT_VERIFIED_AT,
];

export function runMigrations(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  let version = row.user_version;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version]!;
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    version += 1;
  }
}

export function schemaVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  return row.user_version;
}
