import { useState } from 'react';
import type { useSync } from '../sync/useSync';
import { personalLink, tokenFromInput } from '../sync/link';

const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Cadeau-app';

function time(t?: number) {
  return t ? new Date(t).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '';
}

export function Sync({ sync }: { sync: ReturnType<typeof useSync> }) {
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);
  const { status } = sync;

  const share = async () => {
    const t = await sync.token();
    if (!t) return;
    const url = personalLink(`${location.origin}${location.pathname}`, t);
    if (navigator.share) {
      await navigator.share({ title: 'Cadeau', url }).catch(() => undefined);
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    }
  };

  if (status.state === 'off') {
    return (
      <div>
        <h2>Op al je apparaten</h2>
        <p className="small muted">
          Koppel je GitHub, dan staan je profiel en scores op je telefoon, pc en laptop hetzelfde. Ze komen in een geheime gist in je eigen account.
        </p>
        <ol className="small how">
          <li>
            <a href={TOKEN_URL} target="_blank" rel="noreferrer">
              Maak een sleutel op GitHub
            </a>
            . Laat alleen &ldquo;gist&rdquo; aangevinkt en kies een verloopdatum.
          </li>
          <li>Kopieer de sleutel en plak hem hier. Doe dit op elk apparaat.</li>
        </ol>
        <form
          className="add-form"
          onSubmit={(e) => {
            e.preventDefault();
            const t = tokenFromInput(token);
            if (t) void sync.connect(t).then(() => setToken(''));
          }}
        >
          <label className="field">
            <span>GitHub-sleutel of je persoonlijke link</span>
            <input type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_…" />
          </label>
          <div>
            <button className="btn primary" type="submit" disabled={!tokenFromInput(token)}>
              Koppelen
            </button>
          </div>
        </form>
        <p className="small muted">De sleutel blijft op dit apparaat en gaat alleen naar GitHub.</p>
      </div>
    );
  }

  return (
    <div>
      <h2>Op al je apparaten</h2>
      <p className="small" role="status">
        {status.state === 'busy'
          ? 'Synchroniseren…'
          : status.state === 'ok'
            ? `Gekoppeld met GitHub. Bijgewerkt om ${time(status.lastAt)}.`
            : status.message}
      </p>
      <div className="backup">
        <button className="btn" type="button" onClick={() => void sync.syncNow()} disabled={status.state === 'busy'}>
          Nu bijwerken
        </button>
        <button className="btn primary" type="button" onClick={() => void share()}>
          Deel met ander apparaat
        </button>
        <button className="btn quiet" type="button" onClick={() => void sync.disconnect()}>
          Ontkoppelen
        </button>
      </div>
      <p className="small muted">
        {copied ? 'Link gekopieerd. ' : ''}Open je persoonlijke link 1 keer op je andere apparaten, dan zijn ze gekoppeld. De link bevat je sleutel: stuur hem alleen naar jezelf.
      </p>
    </div>
  );
}
