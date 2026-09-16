import { useState } from 'react';
import { useStore } from '../store';
import { cleanError, formatBytes } from '../util';
import { AddGDriveModal, AddMegaModal } from './Modals';
import { IconKey, IconLogo, IconPlus, IconRefresh, IconTrash } from './Icons';

function providerInitial(provider: string): string {
  if (provider === 'mega') return 'M';
  if (provider === 'gdrive') return 'G';
  return '?';
}

export function Sidebar() {
  const accounts = useStore((s) => s.accounts);
  const refreshAccounts = useStore((s) => s.refreshAccounts);
  const setError = useStore((s) => s.setError);
  const [modal, setModal] = useState<'mega' | 'gdrive' | null>(null);

  const totals = accounts
    .filter((a) => a.status === 'active')
    .reduce(
      (acc, a) => ({
        total: acc.total + (a.quotaTotal ?? 0),
        used: acc.used + (a.quotaUsed ?? 0),
      }),
      { total: 0, used: 0 },
    );
  const totalPct = totals.total > 0 ? Math.min(100, (totals.used / totals.total) * 100) : 0;

  const act = async (fn: () => Promise<void>) => {
    try {
      await fn();
      await refreshAccounts();
    } catch (err) {
      setError(cleanError(err));
    }
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-logo">
          <IconLogo size={17} />
        </span>
        <span className="brand-name">StorageWaiter</span>
      </div>

      <div className="sidebar-section">
        <h3 className="section-label">Contas</h3>
        {accounts.length === 0 && (
          <p className="sidebar-empty">
            Conecte suas nuvens para somar o espaço livre delas em um único lugar.
          </p>
        )}
        {accounts.map((a) => {
          const pct =
            a.quotaTotal && a.quotaTotal > 0
              ? Math.min(100, ((a.quotaUsed ?? 0) / a.quotaTotal) * 100)
              : 0;
          const nearFull = pct >= 90;
          const needsAttention = a.status !== 'active';
          return (
            <div
              className={`account-item ${needsAttention ? 'needs-attention' : ''}`}
              key={a.id}
            >
              <div className="account-head">
                <span className="provider-chip">{providerInitial(a.provider)}</span>
                <span className="account-label" title={a.label}>
                  {a.label}
                </span>
                <span
                  className={`status-dot ${
                    a.status === 'active' ? 'ok' : a.status === 'auth_expired' ? 'warn' : 'danger'
                  }`}
                  title={a.status === 'active' ? 'Conectada' : 'Precisa de atenção'}
                />
              </div>
              <div className="meter">
                <div
                  className={`meter-fill ${nearFull ? 'warn' : ''}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="account-foot">
                <span className={`account-usage num ${needsAttention ? 'warn-text' : ''}`}>
                  {a.status === 'auth_expired'
                    ? 'Reautorização necessária'
                    : a.status !== 'active'
                      ? 'Conta indisponível'
                      : `${formatBytes(a.quotaUsed)} de ${formatBytes(a.quotaTotal)}`}
                </span>
                <span className="account-actions">
                  <button
                    className={`icon-btn ${needsAttention ? 'accent' : ''}`}
                    title={
                      a.provider === 'gdrive'
                        ? 'Reautorizar acesso (abre o navegador)'
                        : 'Reconectar'
                    }
                    onClick={() => act(() => window.core.reconnectAccount(a.id))}
                  >
                    <IconKey size={13} />
                  </button>
                  <button
                    className="icon-btn"
                    title="Reconciliar com a nuvem"
                    onClick={() => act(() => window.core.reconcileAccount(a.id))}
                  >
                    <IconRefresh size={13} />
                  </button>
                  <button
                    className="icon-btn"
                    title="Remover conta"
                    onClick={() => {
                      if (confirm(`Remover a conta "${a.label}"?`)) {
                        void act(() => window.core.removeAccount(a.id));
                      }
                    }}
                  >
                    <IconTrash size={13} />
                  </button>
                </span>
              </div>
            </div>
          );
        })}
        <div className="add-buttons">
          <button className="btn" onClick={() => setModal('mega')}>
            <IconPlus size={13} />
            Mega
          </button>
          <button className="btn" onClick={() => setModal('gdrive')}>
            <IconPlus size={13} />
            Google Drive
          </button>
        </div>
      </div>

      <div className="sidebar-footer">
        <h3 className="section-label">Espaço total</h3>
        <div className="meter tall">
          <div className="meter-fill" style={{ width: `${totalPct}%` }} />
        </div>
        <p className="usage-text num">
          {formatBytes(totals.used)} usados de {formatBytes(totals.total)}
        </p>
      </div>

      {modal === 'mega' && (
        <AddMegaModal onClose={() => setModal(null)} onAdded={() => void refreshAccounts()} />
      )}
      {modal === 'gdrive' && (
        <AddGDriveModal onClose={() => setModal(null)} onAdded={() => void refreshAccounts()} />
      )}
    </aside>
  );
}
