export type Lang = 'pt' | 'en';

/** Source of truth. `en.ts` is typed against this file (`Dict = typeof pt`),
 *  so TypeScript refuses to build if a key goes missing from either one. */
export const pt = {
  brand: 'StorageWaiter',
  home: 'Início',

  common: {
    close: 'Fechar',
    cancel: 'Cancelar',
    wait: 'Aguarde…',
  },

  toolbar: {
    download: 'Baixar',
    rename: 'Renomear',
    delete: 'Excluir',
    deleteCount: (n: number) => `Excluir (${n})`,
    newFolder: 'Nova pasta',
    uploadFiles: 'Enviar arquivos',
  },

  dropOverlay: (folderName: string) => `Solte para enviar para “${folderName}”`,

  deleteConfirm: (names: string[]) => {
    const list = names.slice(0, 5).join(', ') + (names.length > 5 ? '…' : '');
    return `Excluir ${names.length} item(ns)? (${list})\nIsso remove também da nuvem.`;
  },

  savedNotice: (path: string) => `Salvo em ${path}`,
  downloadedNotice: (path: string) => `Baixado para Downloads: ${path}`,

  modals: {
    newFolderTitle: 'Nova pasta',
    folderNameLabel: 'Nome da pasta',
    create: 'Criar',
    renameTitle: (name: string) => `Renomear “${name}”`,
    newNameLabel: 'Novo nome',
  },

  sidebar: {
    accountsLabel: 'Contas',
    emptyAccounts: 'Conecte suas nuvens para somar o espaço livre delas em um único lugar.',
    connected: 'Conectada',
    needsAttention: 'Precisa de atenção',
    reauthRequired: 'Reautorização necessária',
    accountUnavailable: 'Conta indisponível',
    usageOf: (used: string, total: string) => `${used} de ${total}`,
    reauthorizeGDrive: 'Reautorizar acesso (abre o navegador)',
    reconnect: 'Reconectar',
    reconcile: 'Reconciliar com a nuvem',
    removeAccount: 'Remover conta',
    removeAccountConfirm: (label: string) => `Remover a conta "${label}"?`,
    addMega: 'Mega',
    addGDrive: 'Google Drive',
    totalSpaceLabel: 'Espaço total',
    usedOfTotal: (used: string, total: string) => `${used} usados de ${total}`,
  },

  fileGrid: {
    colName: 'Nome',
    colSize: 'Tamanho',
    colAccount: 'Conta',
    colStatus: 'Status',
    uploading: (pct: number) => `Enviando ${pct}%`,
    queued: 'Na fila',
    failed: 'Falhou',
    missingRemote: 'Fora da nuvem',
    emptyTitle: 'Esta pasta está vazia',
    emptyHintBefore: 'Arraste arquivos para cá ou use ',
    emptyHintBold: 'Enviar arquivos',
    emptyHintAfter:
      ' — o app escolhe a nuvem com mais espaço livre. Arquivos colocados na pasta StorageWaiter das suas nuvens aparecem aqui depois de reconciliar.',
  },

  transfers: {
    title: 'Transferências',
    typeUpload: 'Enviando',
    typeDownload: 'Baixando',
    typeDelete: 'Excluindo da nuvem',
    typeReconcile: 'Reconciliando conta',
    queuedBytes: 'na fila',
    retry: 'Tentar de novo',
    cancel: 'Cancelar',
    failedGeneric: 'Falhou',
  },

  addMega: {
    title: 'Adicionar conta Mega',
    nicknameLabel: 'Apelido da conta',
    nicknamePlaceholder: 'ex.: mega-pessoal',
    emailLabel: 'E-mail',
    passwordLabel: 'Senha',
    hint: 'Suas credenciais ficam criptografadas no seu computador (DPAPI) e são usadas apenas para falar direto com o Mega.',
    connect: 'Conectar',
    connecting: 'Conectando…',
  },

  addGDrive: {
    title: 'Adicionar conta Google Drive',
    nicknameLabel: 'Apelido da conta',
    nicknamePlaceholder: 'ex.: gdrive-dudu',
    clientIdLabel: 'OAuth Client ID',
    clientSecretLabel: 'OAuth Client Secret',
    connect: 'Conectar',
    connecting: 'Aguardando autorização no navegador…',
  },
};

export type Dict = typeof pt;
