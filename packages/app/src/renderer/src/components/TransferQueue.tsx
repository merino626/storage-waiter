import { useState } from 'react';
import type { JobInfo } from '@storagewaiter/core';
import { useStore } from '../store';
import { formatBytes } from '../util';
import { useT, useLang, type Dict } from '../i18n';
import { translateCoreError } from '../i18n/translateCoreError';
import {
  IconChevronDown,
  IconChevronUp,
  IconDownload,
  IconRefresh,
  IconTrash,
  IconUpload,
  IconX,
} from './Icons';

function typeLabel(t: Dict, type: JobInfo['type']): string {
  switch (type) {
    case 'upload_part':
      return t.transfers.typeUpload;
    case 'download_part':
      return t.transfers.typeDownload;
    case 'delete_remote':
      return t.transfers.typeDelete;
    case 'reconcile_account':
      return t.transfers.typeReconcile;
  }
}

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
  const t = useT();
  const lang = useLang();
  const jobs = useStore((s) => s.jobs).filter(isVisible);
  const [collapsed, setCollapsed] = useState(false);

  if (jobs.length === 0) return null;

  return (
    <div className="transfers">
      <button className="transfers-head" onClick={() => setCollapsed(!collapsed)}>
        <span className="chev">
          {collapsed ? <IconChevronUp size={13} /> : <IconChevronDown size={13} />}
        </span>
        <span>{t.transfers.title}</span>
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
                    {typeLabel(t, job.type)}
                    {job.nodeName ? ` — ${job.nodeName}` : ''}
                  </span>
                  {job.state === 'failed' && (
                    <span className="transfer-detail">
                      {job.lastError ? translateCoreError(job.lastError, lang) : t.transfers.failedGeneric}
                    </span>
                  )}
                </div>
                <span className="transfer-bytes num">
                  {job.state === 'queued'
                    ? t.transfers.queuedBytes
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
                      title={t.transfers.retry}
                      onClick={() => void window.core.retryJob(job.id)}
                    >
                      <IconRefresh size={13} />
                    </button>
                  ) : (
                    <button
                      className="icon-btn"
                      title={t.transfers.cancel}
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
