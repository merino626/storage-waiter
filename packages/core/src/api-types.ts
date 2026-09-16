/** DTOs shared between core and any front-end (Electron renderer, CLI, future HTTP).
 *  Everything here must be structured-clone-safe (crosses the IPC boundary). */

export interface CoreStatus {
  coreVersion: string;
  schemaVersion: number;
  accountCount: number;
}

export interface AccountInfo {
  id: string;
  provider: string;
  label: string;
  quotaTotal: number | null;
  quotaUsed: number | null;
  status: 'active' | 'auth_expired' | 'disabled' | 'error';
}

export interface NodeInfo {
  id: string;
  parentId: string;
  kind: 'folder' | 'file';
  name: string;
  size: number;
  mime: string | null;
  status: 'ready' | 'uploading' | 'failed' | 'missing_remote';
  /** Label of the account holding the file's (first) part, for the UI badge. */
  accountLabel: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface JobInfo {
  id: string;
  type: 'upload_part' | 'download_part' | 'delete_remote' | 'reconcile_account';
  state: 'queued' | 'running' | 'done' | 'failed' | 'canceled';
  nodeId: string | null;
  nodeName: string | null;
  accountId: string | null;
  progressBytes: number;
  totalBytes: number;
  lastError: string | null;
  createdAt: number;
}

export type AddAccountInput =
  | { provider: 'mega'; label: string; email: string; password: string }
  | { provider: 'gdrive'; label: string; clientId: string; clientSecret: string }
  | { provider: 'fake'; label: string };

/** Events emitted by CoreService (mirrored to the renderer via IPC). */
export interface CoreEvents {
  'job:updated': (job: JobInfo) => void;
  'account:updated': (account: AccountInfo) => void;
  /** Something changed in the virtual tree under this parent. */
  'tree:changed': (payload: { parentId: string }) => void;
}

export const CORE_EVENT_NAMES = ['job:updated', 'account:updated', 'tree:changed'] as const;
