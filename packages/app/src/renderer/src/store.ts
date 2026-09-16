import { create } from 'zustand';
import type { AccountInfo, JobInfo, NodeInfo } from '@storagewaiter/core';
import { cleanError } from './util';

export interface Crumb {
  id: string;
  name: string;
}

interface AppState {
  accounts: AccountInfo[];
  nodes: NodeInfo[];
  jobs: JobInfo[];
  path: Crumb[];
  selection: string[];
  error: string | null;
  notice: string | null;

  currentFolderId(): string;
  refreshAccounts(): Promise<void>;
  refreshNodes(): Promise<void>;
  refreshJobs(): Promise<void>;
  enterFolder(crumb: Crumb): void;
  jumpTo(index: number): void;
  setSelection(ids: string[]): void;
  toggleSelect(id: string, additive: boolean): void;
  setError(message: string | null): void;
  setNotice(message: string | null): void;
  applyJobUpdate(job: JobInfo): void;
}

export const useStore = create<AppState>((set, get) => ({
  accounts: [],
  nodes: [],
  jobs: [],
  path: [{ id: 'root', name: 'Início' }],
  selection: [],
  error: null,
  notice: null,

  currentFolderId: () => {
    const path = get().path;
    return path[path.length - 1]!.id;
  },

  refreshAccounts: async () => {
    try {
      set({ accounts: await window.core.listAccounts() });
    } catch (err) {
      set({ error: cleanError(err) });
    }
  },

  refreshNodes: async () => {
    try {
      const nodes = await window.core.listChildren(get().currentFolderId());
      const alive = new Set(nodes.map((n) => n.id));
      set((s) => ({ nodes, selection: s.selection.filter((id) => alive.has(id)) }));
    } catch (err) {
      set({ error: cleanError(err) });
    }
  },

  refreshJobs: async () => {
    try {
      set({ jobs: await window.core.listJobs() });
    } catch (err) {
      set({ error: cleanError(err) });
    }
  },

  enterFolder: (crumb) => {
    set((s) => ({ path: [...s.path, crumb], selection: [] }));
    void get().refreshNodes();
  },

  jumpTo: (index) => {
    set((s) => ({ path: s.path.slice(0, index + 1), selection: [] }));
    void get().refreshNodes();
  },

  setSelection: (ids) => set({ selection: ids }),

  toggleSelect: (id, additive) =>
    set((s) => {
      if (!additive) return { selection: [id] };
      return s.selection.includes(id)
        ? { selection: s.selection.filter((x) => x !== id) }
        : { selection: [...s.selection, id] };
    }),

  setError: (message) => set({ error: message }),

  setNotice: (message) => set({ notice: message }),

  applyJobUpdate: (job) =>
    set((s) => {
      const rest = s.jobs.filter((j) => j.id !== job.id);
      return { jobs: [job, ...rest].slice(0, 100) };
    }),
}));
