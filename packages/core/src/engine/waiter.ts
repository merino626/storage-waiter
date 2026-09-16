import type { Database } from '../db/database.js';
import { InsufficientSpaceError } from '../util/errors.js';

const HEADROOM_MIN_BYTES = 200 * 1024 * 1024;

export function headroom(sizeBytes: number): number {
  return Math.max(HEADROOM_MIN_BYTES, Math.ceil(sizeBytes * 0.02));
}

/** Picks the active account with the most effective free space that fits
 *  size + headroom. Must run inside the same transaction that enqueues the
 *  job and writes its reservation, so concurrent ingests can't double-book. */
export function choosePlacement(db: Database, sizeBytes: number): string {
  const rows = db
    .prepare(
      `SELECT a.id,
              a.quota_total - a.quota_used - COALESCE(r.reserved, 0) AS free
         FROM accounts a
         LEFT JOIN (
           SELECT account_id, SUM(reserved_bytes) AS reserved
             FROM jobs
            WHERE state IN ('queued', 'running')
            GROUP BY account_id
         ) r ON r.account_id = a.id
        WHERE a.status = 'active'
          AND a.quota_total IS NOT NULL
        ORDER BY free DESC`,
    )
    .all() as Array<{ id: string; free: number }>;

  const needed = sizeBytes + headroom(sizeBytes);
  const best = rows[0];
  if (!best || best.free < needed) throw new InsufficientSpaceError(sizeBytes);
  return best.id;
}
