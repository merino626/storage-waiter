import { randomUUID } from 'node:crypto';
import type { Database } from '../db/database.js';
import type { NodeInfo } from '../api-types.js';

const NODE_SELECT = `
  SELECT n.id, n.parent_id, n.kind, n.name, n.size, n.mime, n.status,
         n.created_at, n.updated_at, a.label AS account_label
    FROM nodes n
    LEFT JOIN file_parts fp ON fp.node_id = n.id AND fp.part_index = 0
    LEFT JOIN accounts a ON a.id = fp.account_id`;

interface NodeRow {
  id: string;
  parent_id: string;
  kind: 'folder' | 'file';
  name: string;
  size: number;
  mime: string | null;
  status: NodeInfo['status'];
  created_at: number;
  updated_at: number;
  account_label: string | null;
}

function toInfo(row: NodeRow): NodeInfo {
  return {
    id: row.id,
    parentId: row.parent_id,
    kind: row.kind,
    name: row.name,
    size: row.size,
    mime: row.mime,
    status: row.status,
    accountLabel: row.account_label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listChildren(db: Database, parentId: string): NodeInfo[] {
  const rows = db
    .prepare(
      `${NODE_SELECT} WHERE n.parent_id = ? AND n.id != 'root'
       ORDER BY n.kind DESC, n.name COLLATE NOCASE`,
    )
    .all(parentId) as unknown as NodeRow[];
  return rows.map(toInfo);
}

export function getNode(db: Database, id: string): NodeInfo | null {
  const row = db.prepare(`${NODE_SELECT} WHERE n.id = ?`).get(id) as NodeRow | undefined;
  return row ? toInfo(row) : null;
}

/** "foto.png" → "foto (2).png" until unique under the parent. */
export function uniqueName(db: Database, parentId: string, name: string): string {
  const exists = db.prepare('SELECT 1 FROM nodes WHERE parent_id = ? AND name = ?');
  if (!exists.get(parentId, name)) return name;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!exists.get(parentId, candidate)) return candidate;
  }
}

export function createFolder(db: Database, parentId: string, name: string): NodeInfo {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO nodes (id, parent_id, kind, name, created_at, updated_at)
     VALUES (?, ?, 'folder', ?, ?, ?)`,
  ).run(id, parentId, uniqueName(db, parentId, name.trim()), now, now);
  return getNode(db, id)!;
}

export function renameNode(db: Database, id: string, newName: string): void {
  db.prepare('UPDATE nodes SET name = ?, updated_at = ? WHERE id = ?').run(
    newName.trim(),
    Date.now(),
    id,
  );
}

export interface PartToDelete {
  partId: string;
  accountId: string;
  remoteRef: string;
  size: number;
}

/** All node ids in the subtree rooted at each given id (roots included). */
export function collectSubtree(db: Database, ids: string[]): string[] {
  const all: string[] = [];
  const stack = [...ids];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === 'root') continue;
    all.push(id);
    const children = db.prepare('SELECT id FROM nodes WHERE parent_id = ?').all(id) as Array<{
      id: string;
    }>;
    stack.push(...children.map((c) => c.id));
  }
  return all;
}

export function collectUploadedParts(db: Database, nodeIds: string[]): PartToDelete[] {
  const parts: PartToDelete[] = [];
  // Only parts still 'uploaded': a 'missing' part is already gone from the
  // cloud, so deleting its node must not fire a remote request at all.
  const stmt = db.prepare(
    "SELECT id, account_id, remote_ref, size FROM file_parts WHERE node_id = ? AND remote_ref IS NOT NULL AND status = 'uploaded'",
  );
  for (const nodeId of nodeIds) {
    for (const row of stmt.all(nodeId) as Array<{
      id: string;
      account_id: string;
      remote_ref: string;
      size: number;
    }>) {
      parts.push({
        partId: row.id,
        accountId: row.account_id,
        remoteRef: row.remote_ref,
        size: row.size,
      });
    }
  }
  return parts;
}
