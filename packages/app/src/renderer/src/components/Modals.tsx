import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { cleanError } from '../util';
import { IconX } from './Icons';

export function ModalShell(props: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" onMouseDown={props.onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2>{props.title}</h2>
          <button className="icon-btn" onClick={props.onClose} title="Fechar">
            <IconX size={14} />
          </button>
        </header>
        {props.children}
      </div>
    </div>
  );
}

export function TextPromptModal(props: {
  title: string;
  label: string;
  initial?: string;
  submitLabel: string;
  onSubmit: (value: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(props.initial ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await props.onSubmit(value.trim());
      props.onClose();
    } catch (err) {
      setError(cleanError(err));
      setBusy(false);
    }
  };

  return (
    <ModalShell title={props.title} onClose={props.onClose}>
      <form onSubmit={submit}>
        <label>
          {props.label}
          <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <footer>
          <button type="button" className="btn" onClick={props.onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !value.trim()}>
            {busy ? 'Aguarde…' : props.submitLabel}
          </button>
        </footer>
      </form>
    </ModalShell>
  );
}

export function AddMegaModal(props: { onClose: () => void; onAdded: () => void }) {
  const [label, setLabel] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await window.core.addAccount({ provider: 'mega', label, email, password });
      props.onAdded();
      props.onClose();
    } catch (err) {
      setError(cleanError(err));
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Adicionar conta Mega" onClose={props.onClose}>
      <form onSubmit={submit}>
        <label>
          Apelido da conta
          <input
            autoFocus
            placeholder="ex.: mega-pessoal"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Senha
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <p className="form-hint">
          Suas credenciais ficam criptografadas no seu computador (DPAPI) e são usadas apenas para
          falar direto com o Mega.
        </p>
        {error && <p className="form-error">{error}</p>}
        <footer>
          <button type="button" className="btn" onClick={props.onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !label.trim() || !email || !password}
          >
            {busy ? 'Conectando…' : 'Conectar'}
          </button>
        </footer>
      </form>
    </ModalShell>
  );
}

export function AddGDriveModal(props: { onClose: () => void; onAdded: () => void }) {
  const [label, setLabel] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.core.getSetting('gdrive.client_id').then((v) => v && setClientId(v));
    void window.core.getSetting('gdrive.client_secret').then((v) => v && setClientSecret(v));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await window.core.addAccount({ provider: 'gdrive', label, clientId, clientSecret });
      props.onAdded();
      props.onClose();
    } catch (err) {
      setError(cleanError(err));
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Adicionar conta Google Drive" onClose={props.onClose}>
      <form onSubmit={submit}>
        <label>
          Apelido da conta
          <input
            autoFocus
            placeholder="ex.: gdrive-dudu"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label>
          OAuth Client ID
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} />
        </label>
        <label>
          OAuth Client Secret
          <input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
        </label>
        <p className="form-hint">
          Configuração única (vale para todas as suas contas Google):{' '}
          <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
            console.cloud.google.com/apis/credentials
          </a>
          {' '}→ crie um projeto → ative a <em>Google Drive API</em> → crie uma credencial{' '}
          <em>OAuth client ID</em> do tipo <strong>Desktop app</strong> e cole o ID e o secret aqui.
          Ao conectar, seu navegador abrirá para você autorizar a conta. O app pede acesso ao
          Drive para conseguir importar arquivos que você colocar na pasta{' '}
          <em>StorageWaiter</em> pelo site, mas por código só toca nessa pasta.
        </p>
        {error && <p className="form-error">{error}</p>}
        <footer>
          <button type="button" className="btn" onClick={props.onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !label.trim() || !clientId || !clientSecret}
          >
            {busy ? 'Aguardando autorização no navegador…' : 'Conectar'}
          </button>
        </footer>
      </form>
    </ModalShell>
  );
}
