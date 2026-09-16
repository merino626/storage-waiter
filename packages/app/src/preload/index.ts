import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  AccountInfo,
  AddAccountInput,
  CoreStatus,
  JobInfo,
  NodeInfo,
} from '@storagewaiter/core';

/** Typed surface exposed to the renderer as window.core. */
export interface CoreApi {
  getStatus(): Promise<CoreStatus>;
  listAccounts(): Promise<AccountInfo[]>;
  addAccount(input: AddAccountInput): Promise<AccountInfo>;
  removeAccount(id: string): Promise<void>;
  reconnectAccount(id: string): Promise<void>;
  reconcileAccount(id: string): Promise<void>;
  listChildren(parentId: string): Promise<NodeInfo[]>;
  getNode(id: string): Promise<NodeInfo | null>;
  createFolder(parentId: string, name: string): Promise<NodeInfo>;
  renameNode(id: string, name: string): Promise<void>;
  deleteNodes(ids: string[]): Promise<void>;
  uploadFiles(parentId: string, paths: string[]): Promise<void>;
  /** Downloads to the Downloads folder (visible) and opens with default app. */
  openNode(id: string): Promise<{ path: string; downloaded: boolean }>;
  listJobs(): Promise<JobInfo[]>;
  cancelJob(id: string): Promise<void>;
  retryJob(id: string): Promise<void>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  /** Native file-picker dialog; returns absolute paths. */
  selectFiles(): Promise<string[]>;
  /** Save-as dialog + download; resolves with the saved path or null. */
  saveNodeAs(nodeId: string): Promise<string | null>;
  /** Absolute path of a dropped File (Electron removed File.path). */
  getPathForFile(file: File): string;
  onEvent(event: string, cb: (payload: unknown) => void): () => void;
}

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args);

const api: CoreApi = {
  getStatus: () => invoke('core:getStatus'),
  listAccounts: () => invoke('core:listAccounts'),
  addAccount: (input) => invoke('core:addAccount', input),
  removeAccount: (id) => invoke('core:removeAccount', id),
  reconnectAccount: (id) => invoke('core:reconnectAccount', id),
  reconcileAccount: (id) => invoke('core:reconcileAccount', id),
  listChildren: (parentId) => invoke('core:listChildren', parentId),
  getNode: (id) => invoke('core:getNode', id),
  createFolder: (parentId, name) => invoke('core:createFolder', parentId, name),
  renameNode: (id, name) => invoke('core:renameNode', id, name),
  deleteNodes: (ids) => invoke('core:deleteNodes', ids),
  uploadFiles: (parentId, paths) => invoke('core:uploadFiles', parentId, paths),
  openNode: (id) => invoke('core:openNode', id),
  listJobs: () => invoke('core:listJobs'),
  cancelJob: (id) => invoke('core:cancelJob', id),
  retryJob: (id) => invoke('core:retryJob', id),
  getSetting: (key) => invoke('core:getSetting', key),
  setSetting: (key, value) => invoke('core:setSetting', key, value),
  selectFiles: () => invoke('app:selectFiles'),
  saveNodeAs: (nodeId) => invoke('app:saveNodeAs', nodeId),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  onEvent: (event, cb) => {
    const channel = `core:event:${event}`;
    const listener = (_: unknown, payload: unknown) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

contextBridge.exposeInMainWorld('core', api);
