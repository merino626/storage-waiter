import { useState } from 'react';
import type { JobInfo } from '@storagewaiter/core';
import { useStore } from '../store';
import { formatBytes } from '../util';
import {
  IconChevronDown,
  IconChevronUp,
  IconDownload,
  IconRefresh,
  IconTrash,
  IconUpload,
  IconX,
} from './Icons';

const TYPE_LABEL: Record<JobInfo['type'], string> = {
  upload_part: 'Enviando',
  download_part: 'Baixando',
  delete_remote: 'Excluindo da nuvem',
  reconcile_account: 'Reconciliando conta',
};

function typeIcon(type: JobInfo['type']) {
  switch (type) {
    case 'upload_part':
      return <IconUpload size={13} />;
    case 'download_part':
      return <IconDownload size={13} />;
    case 'delete_remote':
      return <IconTrash size={13} />;
    case 'reconcile_account':
      return <IconRefresh size={13} />;
  }
}

function isVisible(job: JobInfo): boolean {
  // done/canceled saem da lista; failed fica até retry/cancel
  return job.state === 'queued' || job.state === 'running' || job.state === 'failed';
}

export function TransferQueue() {
  const jobs = useStore((s) => s.jobs).filter(isVisible);
  const [collapsed, setCollapsed] = useState(false);

  if (jobs.length === 0) return null;

  return (
    <div className="transfers">
      <button className="transfers-head" onClick={() => setCollapsed(!collapsed)}>
        <span className="chev">
          {collapsed ? <IconChevronUp size={13} /> : <IconChevronDown size={13} />}
        </span>
        <span>Transferências</span>
        <span className="transfers-count num">{jobs.length}</span>
      </button>
      {!collapsed && (
        <ul className="transfers-list">
          {jobs.map((job) => {
            const pct =
              job.totalBytes > 0
                ? Math.min(100, Math.round((job.progressBytes / job.totalBytes) * 100))
                : job.state === 'running'
                  ? 40
                  : 0;
            return (
              <li key={job.id} className={`transfer ${job.state === 'failed' ? 'transfer-failed' : ''}`}>
                <span className="transfer-icon">{typeIcon(job.type)}</span>
                <div className="transfer-info">
                  <span className="transfer-name">
                    {TYPE_LABEL[job.type]}
                    {job.nodeName ? ` — ${job.nodeName}` : ''}
                  </span>
                  {job.state === 'failed' && (
                    <span className="transfer-detail">{job.lastError ?? 'Falhou'}</span>
                  )}
                </div>
                <span className="transfer-bytes num">
                  {job.state === 'queued'
                    ? 'na fila'
                    : job.state === 'failed'
                      ? ''
                      : job.totalBytes > 0
                        ? `${formatBytes(job.progressBytes)} / ${formatBytes(job.totalBytes)}`
                        : '…'}
                </span>
                <div className="transfer-actions">
                  {job.state === 'failed' ? (
                    <button
                      className="icon-btn"
                      title="Tentar de novo"
                      onClick={() => void window.core.retryJob(job.id)}
                    >
                      <IconRefresh size={13} />
                    </button>
                  ) : (
                    <button
                      className="icon-btn"
                      title="Cancelar"
                      onClick={() => void window.core.cancelJob(job.id)}
                    >
                      <IconX size={13} />
                    </button>
                  )}
                </div>
                {job.state !== 'failed' && (
                  <div className="meter">
                    <div className="meter-fill" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
