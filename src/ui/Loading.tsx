import type { Status } from '../engine/client';
import { mb } from './format';

export function Loading({ status }: { status: Status }) {
  if (status.state === 'error') {
    return (
      <section className="state" aria-live="polite">
        <h1>De catalogus laadt niet</h1>
        <p className="muted">{status.message}</p>
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
      <h1>Catalogus laden</h1>
      <p className="muted">De eerste keer duurt dit even. Daarna staat alles op je telefoon.</p>
      <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)} aria-label="Catalogus">
        <div style={{ transform: `scaleX(${share})` }} />
      </div>
      <p className="small">{total ? `${mb(loaded)} van ${mb(total)}` : 'Verbinden…'}</p>
      <ol className="steps small">
        <li data-state="now">Producten ophalen</li>
        <li>Taalmodel ophalen, zodat de app je woorden begrijpt</li>
      </ol>
    </section>
  );
}
