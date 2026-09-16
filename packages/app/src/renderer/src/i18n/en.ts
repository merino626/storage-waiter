import type { Dict } from './pt';

/** Typed against `Dict = typeof pt` — TypeScript refuses to build if a key
 *  (or a function's shape) drifts from the Portuguese source of truth. */
export const en: Dict = {
  brand: 'StorageWaiter',
  home: 'Home',

  common: {
    close: 'Close',
    cancel: 'Cancel',
    wait: 'Please wait…',
  },

  toolbar: {
    download: 'Download',
    rename: 'Rename',
    delete: 'Delete',
    deleteCount: (n: number) => `Delete (${n})`,
    newFolder: 'New folder',
    uploadFiles: 'Upload files',
  },

  dropOverlay: (folderName: string) => `Drop to upload to “${folderName}”`,

  deleteConfirm: (names: string[]) => {
    const list = names.slice(0, 5).join(', ') + (names.length > 5 ? '…' : '');
    return `Delete ${names.length} item(s)? (${list})\nThis also removes them from the cloud.`;
  },

  savedNotice: (path: string) => `Saved to ${path}`,
  downloadedNotice: (path: string) => `Downloaded to your Downloads folder: ${path}`,

  modals: {
    newFolderTitle: 'New folder',
    folderNameLabel: 'Folder name',
    create: 'Create',
    renameTitle: (name: string) => `Rename “${name}”`,
    newNameLabel: 'New name',
  },

  sidebar: {
    accountsLabel: 'Accounts',
    emptyAccounts: 'Connect your clouds to pool their free space into one place.',
    connected: 'Connected',
    needsAttention: 'Needs attention',
    reauthRequired: 'Reauthorization needed',
    accountUnavailable: 'Account unavailable',
    usageOf: (used: string, total: string) => `${used} of ${total}`,
    reauthorizeGDrive: 'Reauthorize access (opens the browser)',
    reconnect: 'Reconnect',
    reconcile: 'Reconcile with the cloud',
    removeAccount: 'Remove account',
    removeAccountConfirm: (label: string) => `Remove the account "${label}"?`,
    addMega: 'Mega',
    addGDrive: 'Google Drive',
    totalSpaceLabel: 'Total space',
    usedOfTotal: (used: string, total: string) => `${used} used of ${total}`,
  },

  fileGrid: {
    colName: 'Name',
    colSize: 'Size',
    colAccount: 'Account',
    colStatus: 'Status',
    uploading: (pct: number) => `Uploading ${pct}%`,
    queued: 'Queued',
    failed: 'Failed',
    missingRemote: 'Off the cloud',
    emptyTitle: 'This folder is empty',
    emptyHintBefore: 'Drag files in here or use ',
    emptyHintBold: 'Upload files',
    emptyHintAfter:
      ' — the app picks whichever cloud has the most free space. Files you drop into the StorageWaiter folder show up here after a reconcile.',
  },

  transfers: {
    title: 'Transfers',
    typeUpload: 'Uploading',
    typeDownload: 'Downloading',
    typeDelete: 'Deleting from cloud',
    typeReconcile: 'Reconciling account',
    queuedBytes: 'queued',
    retry: 'Retry',
    cancel: 'Cancel',
    failedGeneric: 'Failed',
  },

  addMega: {
    title: 'Add a Mega account',
    nicknameLabel: 'Account nickname',
    nicknamePlaceholder: 'e.g.: mega-personal',
    emailLabel: 'E-mail',
    passwordLabel: 'Password',
    hint: 'Your credentials are encrypted on your computer (DPAPI) and used only to talk directly to Mega.',
    connect: 'Connect',
    connecting: 'Connecting…',
  },

  addGDrive: {
    title: 'Add a Google Drive account',
    nicknameLabel: 'Account nickname',
    nicknamePlaceholder: 'e.g.: gdrive-personal',
    clientIdLabel: 'OAuth Client ID',
    clientSecretLabel: 'OAuth Client Secret',
    connect: 'Connect',
    connecting: 'Waiting for authorization in the browser…',
  },
};
