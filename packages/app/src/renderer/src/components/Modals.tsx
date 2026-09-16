import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useStore } from '../store';
import { useT, useLang } from '../i18n';
import { IconX } from './Icons';

export function ModalShell(props: { title: string; onClose: () => void; children: ReactNode }) {
  const t = useT();
  return (
    <div className="modal-backdrop" onMouseDown={props.onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2>{props.title}</h2>
          <button className="icon-btn" onClick={props.onClose} title={t.common.close}>
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
  const t = useT();
  const describeError = useStore((s) => s.describeError);
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
      setError(describeError(err));
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
            {t.common.cancel}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !value.trim()}>
            {busy ? t.common.wait : props.submitLabel}
          </button>
        </footer>
      </form>
    </ModalShell>
  );
}

export function AddMegaModal(props: { onClose: () => void; onAdded: () => void }) {
  const t = useT();
  const describeError = useStore((s) => s.describeError);
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
      setError(describeError(err));
      setBusy(false);
    }
  };

  return (
    <ModalShell title={t.addMega.title} onClose={props.onClose}>
      <form onSubmit={submit}>
        <label>
          {t.addMega.nicknameLabel}
          <input
            autoFocus
            placeholder={t.addMega.nicknamePlaceholder}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label>
          {t.addMega.emailLabel}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          {t.addMega.passwordLabel}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <p className="form-hint">{t.addMega.hint}</p>
        {error && <p className="form-error">{error}</p>}
        <footer>
          <button type="button" className="btn" onClick={props.onClose}>
            {t.common.cancel}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !label.trim() || !email || !password}
          >
            {busy ? t.addMega.connecting : t.addMega.connect}
          </button>
        </footer>
      </form>
    </ModalShell>
  );
}

const GDRIVE_CREDENTIALS_URL = 'https://console.cloud.google.com/apis/credentials';

/** Kept as JSX per language (not a flat dict string) because of the inline
 *  link/bold/italic formatting mixed into the copy. */
function GDriveHint({ lang }: { lang: 'pt' | 'en' }) {
  if (lang === 'en') {
    return (
      <p className="form-hint">
        One-time setup (works for every Google account you connect):{' '}
        <a href={GDRIVE_CREDENTIALS_URL} target="_blank" rel="noreferrer">
          console.cloud.google.com/apis/credentials
        </a>
        {' '}→ create a project → enable the <em>Google Drive API</em> → create an{' '}
        <em>OAuth client ID</em> credential of type <strong>Desktop app</strong> and paste the ID
        and secret here. When you connect, your browser opens for you to authorize the account.
        The app requests Drive access so it can import files you drop into the{' '}
        <em>StorageWaiter</em> folder from the website, but by code it only ever touches that
        folder.
      </p>
    );
  }
  return (
    <p className="form-hint">
      Configuração única (vale para todas as suas contas Google):{' '}
      <a href={GDRIVE_CREDENTIALS_URL} target="_blank" rel="noreferrer">
        console.cloud.google.com/apis/credentials
      </a>
      {' '}→ crie um projeto → ative a <em>Google Drive API</em> → crie uma credencial{' '}
      <em>OAuth client ID</em> do tipo <strong>Desktop app</strong> e cole o ID e o secret aqui.
      Ao conectar, seu navegador abrirá para você autorizar a conta. O app pede acesso ao
      Drive para conseguir importar arquivos que você colocar na pasta{' '}
      <em>StorageWaiter</em> pelo site, mas por código só toca nessa pasta.
    </p>
  );
}

export function AddGDriveModal(props: { onClose: () => void; onAdded: () => void }) {
  const t = useT();
  const lang = useLang();
  const describeError = useStore((s) => s.describeError);
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
      setError(describeError(err));
      setBusy(false);
    }
  };

  return (
    <ModalShell title={t.addGDrive.title} onClose={props.onClose}>
      <form onSubmit={submit}>
        <label>
          {t.addGDrive.nicknameLabel}
          <input
            autoFocus
            placeholder={t.addGDrive.nicknamePlaceholder}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label>
          {t.addGDrive.clientIdLabel}
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} />
        </label>
        <label>
          {t.addGDrive.clientSecretLabel}
          <input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
        </label>
        <GDriveHint lang={lang} />
        {error && <p className="form-error">{error}</p>}
        <footer>
          <button type="button" className="btn" onClick={props.onClose}>
            {t.common.cancel}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !label.trim() || !clientId || !clientSecret}
          >
            {busy ? t.addGDrive.connecting : t.addGDrive.connect}
          </button>
        </footer>
      </form>
    </ModalShell>
  );
}
