import type { NodeInfo } from '@storagewaiter/core';
import { useStore } from '../store';
import { cleanError, formatBytes } from '../util';
import {
  fileTypeIcon,
  IconAlert,
  IconCloud,
  IconCloudOff,
  IconFolder,
  IconSpinner,
} from './Icons';

function UploadStatus({ nodeId }: { nodeId: string }) {
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
      <span className="num">{pct !== null ? `Enviando ${pct}%` : 'Na fila'}</span>
    </span>
  );
}

function StatusCell({ node }: { node: NodeInfo }) {
  switch (node.status) {
    case 'uploading':
      return <UploadStatus nodeId={node.id} />;
    case 'failed':
      return (
        <span className="file-cell-status danger">
          <IconAlert size={12} />
          Falhou
        </span>
      );
    case 'missing_remote':
      return (
        <span className="file-cell-status warn">
          <IconCloudOff size={12} />
          Fora da nuvem
        </span>
      );
    default:
      return <span className="file-cell-status" />;
  }
}

export function FileGrid() {
  const nodes = useStore((s) => s.nodes);
  const selection = useStore((s) => s.selection);
  const toggleSelect = useStore((s) => s.toggleSelect);
  const setSelection = useStore((s) => s.setSelection);
  const enterFolder = useStore((s) => s.enterFolder);
  const setError = useStore((s) => s.setError);
  const setNotice = useStore((s) => s.setNotice);

  const open = async (node: NodeInfo) => {
    if (node.kind === 'folder') {
      enterFolder({ id: node.id, name: node.name });
      return;
    }
    try {
      const result = await window.core.openNode(node.id);
      if (result.downloaded) setNotice(`Baixado para Downloads: ${result.path}`);
    } catch (err) {
      setError(cleanError(err));
    }
  };

  if (nodes.length === 0) {
    return (
      <div className="grid-empty" onMouseDown={() => setSelection([])}>
        <span className="grid-empty-icon">
          <IconCloud size={30} />
        </span>
        <p className="grid-empty-title">Esta pasta está vazia</p>
        <p className="grid-empty-hint">
          Arraste arquivos para cá ou use <strong>Enviar arquivos</strong> — o app escolhe a nuvem
          com mais espaço livre. Arquivos colocados na pasta StorageWaiter das suas nuvens aparecem
          aqui depois de reconciliar.
        </p>
      </div>
    );
  }

  return (
    <div className="file-list" onMouseDown={(e) => e.target === e.currentTarget && setSelection([])}>
      <div className="file-list-header">
        <span>Nome</span>
        <span style={{ textAlign: 'right' }}>Tamanho</span>
        <span>Conta</span>
        <span>Status</span>
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
