import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { CoreService } from '@storagewaiter/core';
import { SafeStorageCipher } from './safe-storage-cipher';
import { registerCoreBridge } from './ipc-bridge';

let core: CoreService | null = null;

function resolveDataDirs() {
  const dataDir = app.getPath('userData'); // %APPDATA%/StorageWaiter
  const localBase = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'StorageWaiter')
    : dataDir;
  return {
    dbPath: join(dataDir, 'storagewaiter.db'),
    cacheDir: join(localBase, 'cache'),
    stagingDir: join(localBase, 'staging'),
    downloadsDir: app.getPath('downloads'),
  };
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 860,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    title: 'StorageWaiter',
    backgroundColor: '#101116',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.on('ready-to-show', () => win.show());

  // External links open in the system browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

app.whenReady().then(async () => {
  core = new CoreService({
    ...resolveDataDirs(),
    cipher: new SafeStorageCipher(),
    openUrl: (url) => shell.openExternal(url),
    openFile: async (path) => {
      const err = await shell.openPath(path);
      if (err) throw new Error(err);
    },
  });
  await core.start();

  const win = createWindow();
  registerCoreBridge(core, win);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const w = createWindow();
      if (core) registerCoreBridge(core, w);
    }
  });
});

app.on('window-all-closed', () => {
  core?.close();
  core = null;
  app.quit();
});
