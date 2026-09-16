import { app, dialog, ipcMain, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import { CORE_EVENT_NAMES, type CoreService } from '@storagewaiter/core';

/** Maps CoreService methods to ipcMain.handle channels and forwards core
 *  events to the renderer. This adapter is the ONLY place where core meets
 *  Electron IPC — core itself stays transport-agnostic. */
export function registerCoreBridge(core: CoreService, win: BrowserWindow): void {
  // Each entry becomes an invoke channel `core:<name>`.
  const methods = {
    getStatus: () => core.getStatus(),
    listAccounts: () => core.listAccounts(),
    addAccount: (input: Parameters<CoreService['addAccount']>[0]) => core.addAccount(input),
    removeAccount: (id: string) => core.removeAccount(id),
    reconnectAccount: (id: string) => core.reconnectAccount(id),
    reconcileAccount: (id: string) => core.reconcileAccount(id),
    listChildren: (parentId: string) => core.listChildren(parentId),
    getNode: (id: string) => core.getNode(id),
    createFolder: (parentId: string, name: string) => core.createFolder(parentId, name),
    renameNode: (id: string, name: string) => core.renameNode(id, name),
    deleteNodes: (ids: string[]) => core.deleteNodes(ids),
    uploadFiles: (parentId: string, paths: string[]) => core.uploadFiles(parentId, paths),
    openNode: (id: string) => core.openNode(id),
    listJobs: () => core.listJobs(),
    cancelJob: (id: string) => core.cancelJob(id),
    retryJob: (id: string) => core.retryJob(id),
    getSetting: (key: string) => core.getSetting(key),
    setSetting: (key: string, value: string) => core.setSetting(key, value),
  } as const;

  for (const [name, fn] of Object.entries(methods)) {
    const channel = `core:${name}`;
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        return await (fn as (...a: unknown[]) => unknown)(...args);
      } catch (err) {
        // Terminal do main é o log de diagnóstico do app.
        console.error(`[${channel}]`, err);
        throw err;
      }
    });
  }

  ipcMain.removeHandler('app:selectFiles');
  ipcMain.handle('app:selectFiles', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Enviar arquivos para o StorageWaiter',
      properties: ['openFile', 'multiSelections'],
    });
    return result.canceled ? [] : result.filePaths;
  });

  // "Baixar": asks where to save (defaults to Downloads), then downloads there.
  ipcMain.removeHandler('app:saveNodeAs');
  ipcMain.handle('app:saveNodeAs', async (_event, nodeId: string) => {
    const node = await core.getNode(nodeId);
    if (!node) throw new Error('Arquivo não encontrado');
    const result = await dialog.showSaveDialog(win, {
      title: 'Baixar arquivo',
      defaultPath: join(app.getPath('downloads'), node.name),
    });
    if (result.canceled || !result.filePath) return null;
    await core.saveNodeTo(nodeId, result.filePath);
    return result.filePath;
  });

  for (const event of CORE_EVENT_NAMES) {
    const listener = (payload: unknown) => {
      if (!win.isDestroyed()) win.webContents.send(`core:event:${event}`, payload);
    };
    core.on(event, listener);
    win.on('closed', () => core.off(event, listener));
  }
}
