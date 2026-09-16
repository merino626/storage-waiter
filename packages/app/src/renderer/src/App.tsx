import { useCallback, useEffect, useState, type DragEvent } from 'react';
import type { JobInfo } from '@storagewaiter/core';
import { useStore } from './store';
import { useT } from './i18n';
import { Sidebar } from './components/Sidebar';
import { FileGrid } from './components/FileGrid';
import { TransferQueue } from './components/TransferQueue';
import { TextPromptModal } from './components/Modals';
import {
  IconChevronRight,
  IconDownload,
  IconFolderPlus,
  IconPencil,
  IconTrash,
  IconUpload,
  IconX,
} from './components/Icons';

export default function App() {
  const t = useT();
  const path = useStore((s) => s.path);
  const selection = useStore((s) => s.selection);
  const nodes = useStore((s) => s.nodes);
  const error = useStore((s) => s.error);
  const notice = useStore((s) => s.notice);
  const setError = useStore((s) => s.setError);
  const setNotice = useStore((s) => s.setNotice);
  const describeError = useStore((s) => s.describeError);
  const jumpTo = useStore((s) => s.jumpTo);
  const refreshAccounts = useStore((s) => s.refreshAccounts);
  const refreshNodes = useStore((s) => s.refreshNodes);
  const refreshJobs = useStore((s) => s.refreshJobs);
  const applyJobUpdate = useStore((s) => s.applyJobUpdate);

  const [modal, setModal] = useState<'new-folder' | 'rename' | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    void refreshAccounts();
    void refreshNodes();
    void refreshJobs();

    const offJob = window.core.onEvent('job:updated', (p) => applyJobUpdate(p as JobInfo));
    const offAccount = window.core.onEvent('account:updated', () => void refreshAccounts());
    const offTree = window.core.onEvent('tree:changed', (p) => {
      const { parentId } = p as { parentId: string };
      if (parentId === useStore.getState().currentFolderId()) void refreshNodes();
    });
    return () => {
      offJob();
      offAccount();
      offTree();
    };
  }, [refreshAccounts, refreshNodes, refreshJobs, applyJobUpdate]);

  // Avisos de sucesso saem sozinhos; a interface fica quieta.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice, setNotice]);

  const uploadPaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;
      try {
        await window.core.uploadFiles(useStore.getState().currentFolderId(), paths);
      } catch (err) {
        setError(describeError(err));
      }
    },
    [setError, describeError],
  );

  const pickAndUpload = async () => {
    const paths = await window.core.selectFiles();
    await uploadPaths(paths);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const paths = Array.from(e.dataTransfer.files).map((f) => window.core.getPathForFile(f));
    void uploadPaths(paths.filter(Boolean));
  };

  const deleteSelection = async () => {
    const names = nodes.filter((n) => selection.includes(n.id)).map((n) => n.name);
    if (names.length === 0) return;
    if (!confirm(t.deleteConfirm(names))) return;
    try {
      await window.core.deleteNodes(selection);
    } catch (err) {
      setError(describeError(err));
    }
  };

  const selectedNode = selection.length === 1 ? nodes.find((n) => n.id === selection[0]) : undefined;

  const downloadSelected = async () => {
    if (!selectedNode || selectedNode.kind !== 'file') return;
    try {
      const saved = await window.core.saveNodeAs(selectedNode.id);
      if (saved) setNotice(t.savedNotice(saved));
    } catch (err) {
      setError(describeError(err));
    }
  };

  const currentFolderName = path.length === 1 ? t.home : path[path.length - 1]!.name;

  return (
    <div
      className="shell"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.target === e.currentTarget) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <Sidebar />

      <main className="content">
        <div className="toolbar">
          <nav className="breadcrumb">
            {path.map((crumb, i) => (
              <span key={crumb.id} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && (
                  <span className="crumb-sep">
                    <IconChevronRight size={12} />
                  </span>
                )}
                <button
                  className={`crumb ${i === path.length - 1 ? 'crumb-current' : ''}`}
                  onClick={() => jumpTo(i)}
                >
                  {i === 0 ? t.home : crumb.name}
                </button>
              </span>
            ))}
          </nav>
          <div className="toolbar-actions">
            {selectedNode?.kind === 'file' && selectedNode.status === 'ready' && (
              <button className="btn" onClick={() => void downloadSelected()}>
                <IconDownload size={13} />
                {t.toolbar.download}
              </button>
            )}
            {selectedNode && (
              <button className="btn" onClick={() => setModal('rename')}>
                <IconPencil size={13} />
                {t.toolbar.rename}
              </button>
            )}
            {selection.length > 0 && (
              <button className="btn btn-danger" onClick={() => void deleteSelection()}>
                <IconTrash size={13} />
                {selection.length > 1 ? t.toolbar.deleteCount(selection.length) : t.toolbar.delete}
              </button>
            )}
            <button className="btn" onClick={() => setModal('new-folder')}>
              <IconFolderPlus size={13} />
              {t.toolbar.newFolder}
            </button>
            <button className="btn btn-primary" onClick={() => void pickAndUpload()}>
              <IconUpload size={13} />
              {t.toolbar.uploadFiles}
            </button>
          </div>
        </div>

        <FileGrid />
        <TransferQueue />
      </main>

      {dragging && (
        <div className="drop-overlay">
          <div className="drop-box">
            <IconUpload size={20} />
            {t.dropOverlay(currentFolderName)}
          </div>
        </div>
      )}

      {error && (
        <div className="toast" onClick={() => setError(null)}>
          <span>{error}</span>
          <button className="icon-btn" aria-label={t.common.close}>
            <IconX size={13} />
          </button>
        </div>
      )}
      {notice && !error && (
        <div className="toast toast-ok" onClick={() => setNotice(null)}>
          <span>{notice}</span>
          <button className="icon-btn" aria-label={t.common.close}>
            <IconX size={13} />
          </button>
        </div>
      )}

      {modal === 'new-folder' && (
        <TextPromptModal
          title={t.modals.newFolderTitle}
          label={t.modals.folderNameLabel}
          submitLabel={t.modals.create}
          onClose={() => setModal(null)}
          onSubmit={async (name) => {
            await window.core.createFolder(useStore.getState().currentFolderId(), name);
          }}
        />
      )}
      {modal === 'rename' && selectedNode && (
        <TextPromptModal
          title={t.modals.renameTitle(selectedNode.name)}
          label={t.modals.newNameLabel}
          initial={selectedNode.name}
          submitLabel={t.toolbar.rename}
          onClose={() => setModal(null)}
          onSubmit={async (name) => {
            await window.core.renameNode(selectedNode.id, name);
          }}
        />
      )}
    </div>
  );
}
