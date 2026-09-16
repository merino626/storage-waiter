import type { NodeInfo } from '@storagewaiter/core';
import { useStore } from '../store';
import { formatBytes } from '../util';
import { useT } from '../i18n';
import {
  fileTypeIcon,
  IconAlert,
  IconCloud,
  IconCloudOff,
  IconFolder,
  IconSpinner,
} from './Icons';

function UploadStatus({ nodeId }: { nodeId: string }) {
  const t = useT();
  const job = useStore((s) =>
    s.jobs.find(
      (j) => j.type === 'upload_part' && j.nodeId === nodeId && j.state !== 'done',
    ),
  );
  const pct =
    job && job.totalBytes > 0
      ? Math.min(99, Math.round((job.progressBytes / job.totalBytes) * 100))
      : null;
  return (
    <span className="file-cell-status">
      <IconSpinner size={12} />
      <span className="num">{pct !== null ? t.fileGrid.uploading(pct) : t.fileGrid.queued}</span>
    </span>
  );
}

function StatusCell({ node }: { node: NodeInfo }) {
  const t = useT();
  switch (node.status) {
    case 'uploading':
      return <UploadStatus nodeId={node.id} />;
    case 'failed':
      return (
        <span className="file-cell-status danger">
          <IconAlert size={12} />
          {t.fileGrid.failed}
        </span>
      );
    case 'missing_remote':
      return (
        <span className="file-cell-status warn">
          <IconCloudOff size={12} />
          {t.fileGrid.missingRemote}
        </span>
      );
    default:
      return <span className="file-cell-status" />;
  }
}

export function FileGrid() {
  const t = useT();
  const nodes = useStore((s) => s.nodes);
  const selection = useStore((s) => s.selection);
  const toggleSelect = useStore((s) => s.toggleSelect);
  const setSelection = useStore((s) => s.setSelection);
  const enterFolder = useStore((s) => s.enterFolder);
  const setError = useStore((s) => s.setError);
  const setNotice = useStore((s) => s.setNotice);
  const describeError = useStore((s) => s.describeError);

  const open = async (node: NodeInfo) => {
    if (node.kind === 'folder') {
      enterFolder({ id: node.id, name: node.name });
      return;
    }
    try {
      const result = await window.core.openNode(node.id);
      if (result.downloaded) setNotice(t.downloadedNotice(result.path));
    } catch (err) {
      setError(describeError(err));
    }
  };

  if (nodes.length === 0) {
    return (
      <div className="grid-empty" onMouseDown={() => setSelection([])}>
        <span className="grid-empty-icon">
          <IconCloud size={30} />
        </span>
        <p className="grid-empty-title">{t.fileGrid.emptyTitle}</p>
        <p className="grid-empty-hint">
          {t.fileGrid.emptyHintBefore}
          <strong>{t.fileGrid.emptyHintBold}</strong>
          {t.fileGrid.emptyHintAfter}
        </p>
      </div>
    );
  }

  return (
    <div className="file-list" onMouseDown={(e) => e.target === e.currentTarget && setSelection([])}>
      <div className="file-list-header">
        <span>{t.fileGrid.colName}</span>
        <span style={{ textAlign: 'right' }}>{t.fileGrid.colSize}</span>
        <span>{t.fileGrid.colAccount}</span>
        <span>{t.fileGrid.colStatus}</span>
      </div>
      {nodes.map((node) => (
        <div
          key={node.id}
          className={`file-row ${selection.includes(node.id) ? 'selected' : ''} ${
            node.status !== 'ready' ? 'dimmed' : ''
          }`}
          onMouseDown={(e) => {
            e.stopPropagation();
            toggleSelect(node.id, e.ctrlKey || e.metaKey);
          }}
          onDoubleClick={() => void open(node)}
          title={node.name}
        >
          <span className="file-cell-name">
            <span className="file-icon">
              {node.kind === 'folder' ? (
                <IconFolder size={16} />
              ) : (
                fileTypeIcon(node.name, node.mime, 16)
              )}
            </span>
            <span className="file-name">{node.name}</span>
          </span>
          <span className="file-cell-size num">
            {node.kind === 'file' ? formatBytes(node.size) : '—'}
          </span>
          <span className="file-cell-account">{node.accountLabel ?? '—'}</span>
          <StatusCell node={node} />
        </div>
      ))}
    </div>
  );
}
