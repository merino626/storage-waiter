export const MIGRATION_001_INIT = `
CREATE TABLE accounts (
  id                 TEXT PRIMARY KEY,
  provider           TEXT NOT NULL,
  label              TEXT NOT NULL UNIQUE,
  auth_blob          BLOB NOT NULL,
  quota_total        INTEGER,
  quota_used         INTEGER,
  status             TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','auth_expired','disabled','error')),
  last_reconciled_at INTEGER,
  created_at         INTEGER NOT NULL
);

-- Virtual folder tree. Fixed root row (id='root', parent_id='root') avoids the
-- SQLite pitfall that NULLs are distinct in UNIQUE constraints, which would
-- otherwise allow duplicate names at the root level.
CREATE TABLE nodes (
  id           TEXT PRIMARY KEY,
  parent_id    TEXT NOT NULL REFERENCES nodes(id),
  kind         TEXT NOT NULL CHECK (kind IN ('folder','file')),
  name         TEXT NOT NULL,
  size         INTEGER NOT NULL DEFAULT 0,
  mime         TEXT,
  content_hash TEXT,
  status       TEXT NOT NULL DEFAULT 'ready'
               CHECK (status IN ('ready','uploading','failed','missing_remote')),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  UNIQUE (parent_id, name)
);
CREATE INDEX idx_nodes_parent ON nodes(parent_id);

INSERT INTO nodes (id, parent_id, kind, name, created_at, updated_at)
VALUES ('root', 'root', 'folder', '', strftime('%s','now') * 1000, strftime('%s','now') * 1000);

-- Chunk-ready: MVP writes exactly one row per file (part_index=0);
-- v2 chunking writes N rows with no schema change.
CREATE TABLE file_parts (
  id         TEXT PRIMARY KEY,
  node_id    TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  part_index INTEGER NOT NULL,
  size       INTEGER NOT NULL,
  hash       TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  remote_ref TEXT,
  status     TEXT NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending','uploaded','missing')),
  created_at INTEGER NOT NULL,
  UNIQUE (node_id, part_index)
);
CREATE INDEX idx_parts_account ON file_parts(account_id);

-- Persistent job queue: source of truth for the transfers UI AND crash recovery.
CREATE TABLE jobs (
  id             TEXT PRIMARY KEY,
  type           TEXT NOT NULL
                 CHECK (type IN ('upload_part','download_part','delete_remote','reconcile_account')),
  state          TEXT NOT NULL DEFAULT 'queued'
                 CHECK (state IN ('queued','running','done','failed','canceled')),
  node_id        TEXT,
  part_id        TEXT,
  account_id     TEXT,
  attempts       INTEGER NOT NULL DEFAULT 0,
  max_attempts   INTEGER NOT NULL DEFAULT 5,
  reserved_bytes INTEGER NOT NULL DEFAULT 0,
  local_path     TEXT,
  progress_bytes INTEGER NOT NULL DEFAULT 0,
  last_error     TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX idx_jobs_state ON jobs(state);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
