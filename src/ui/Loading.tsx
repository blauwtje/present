import type { Status } from '../engine/client';
import { mb } from './format';

const RING_R = 20;
const RING_LEN = 2 * Math.PI * RING_R;

/** The branded progress ring: same punched-tag material as the idea card's hole,
 * driven by the real `share` (0 while connecting, which also flags indeterminate). */
function LoadingMark({ share, negative }: { share: number; negative?: boolean }) {
  return (
    <div className="load-mark" data-indeterminate={share === 0 || undefined} data-tone={negative ? 'negative' : undefined} aria-hidden="true">
      <svg viewBox="0 0 44 44">
        <circle className="load-ring-track" cx="22" cy="22" r={RING_R} />
        <circle
          className="load-ring-fill"
          cx="22"
          cy="22"
          r={RING_R}
          strokeDasharray={RING_LEN}
          strokeDashoffset={negative ? 0 : RING_LEN * (1 - share)}
        />
      </svg>
    </div>
  );
}

export function Loading({ status }: { status: Status }) {
  if (status.state === 'error') {
    return (
      <section className="state" aria-live="polite">
        <LoadingMark share={1} negative />
        <h1>De catalogus laadt niet</h1>
        <p className="notice" data-tone="negative">
          {status.message}
        </p>
        <button className="btn primary" type="button" onClick={() => location.reload()}>
          Opnieuw proberen
        </button>
      </section>
    );
  }
  const loading = status.state === 'loading' ? status : null;
  const total = loading?.total ?? 0;
  const loaded = loading?.loaded ?? 0;
  const share = total ? loaded / total : 0;
  return (
    <section className="state" aria-live="polite" aria-busy="true">
      <LoadingMark share={share} />
      <h1>Catalogus laden</h1>
      <p className="muted">De eerste keer duurt dit even. Daarna staat alles op je telefoon.</p>
      <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)} aria-label="Catalogus">
        <div style={{ transform: `scaleX(${share})` }} />
      </div>
      <p className="small">{total ? `${mb(loaded)} van ${mb(total)}` : 'Verbinden…'}</p>
      <ol className="steps small">
        <li data-state={total ? 'now' : undefined}>Producten ophalen</li>
        <li>Taalmodel ophalen, zodat de app je woorden begrijpt</li>
      </ol>
    </section>
  );
}
