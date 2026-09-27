import { useState } from 'react';
import type { Status } from '../engine/client';
import type { ProfileData, SuggestedProduct } from '../engine/protocol';
import type { Filters } from '../engine/types';
import { categoryName } from '../engine/reason';
import { price } from './format';
import { ScoreRow } from './ScoreRow';

interface Props {
  queue: SuggestedProduct[];
  thinking: boolean;
  error: string | null;
  status: Extract<Status, { state: 'ready' }>;
  profile: ProfileData;
  filters: Filters;
  onRate: (p: SuggestedProduct, score: number) => void;
  onFilters: (f: Filters) => void;
  onGoProfile: () => void;
}

function splitReason(reason: string) {
  const i = reason.indexOf(': ');
  return i < 0 ? [reason, ''] : [reason.slice(0, i + 1), reason.slice(i + 2)];
}

export function Suggestions({ queue, thinking, error, status, profile, filters, onRate, onFilters, onGoProfile }: Props) {
  const [leaving, setLeaving] = useState<number | null>(null);
  const head = queue[0];
  const model = status.model;
  const modelLoading = model && model.total > 0 && model.loaded < model.total;
  const needsProfile = profile.interests.length === 0 && profile.owned.length === 0 && profile.ratings.length < 3;

  const pick = (score: number) => {
    if (!head || leaving != null) return;
    // Without motion there is no animation end to wait for.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) onRate(head, score);
    else setLeaving(score);
  };

  return (
    <section className="feed">
      <div>
        <div className="page-head">
          <h1>Ideeën</h1>
          <span className="small muted" aria-live="polite">
            {thinking ? (modelLoading ? `Taalmodel laden ${Math.round((model.loaded / model.total) * 100)}%` : 'Bijwerken…') : `${status.count.toLocaleString('nl-NL')} producten`}
          </span>
        </div>

        <details className="panel filters" open={Boolean(filters.categories?.length || filters.minPriceCents || filters.maxPriceCents) || undefined}>
          <summary>Filters</summary>
          <FilterForm status={status} filters={filters} onChange={onFilters} />
        </details>

        {needsProfile && (
          <p className="notice">
            Vertel wat je leuk vindt, dan worden de ideeën persoonlijk.{' '}
            <button type="button" className="btn quiet" onClick={onGoProfile}>
              Naar profiel
            </button>
          </p>
        )}
        {error && <p className="notice">{error}</p>}

        {head ? (
          <div className="tag-wrap">
            <article
              key={head.id}
              className={leaving != null ? 'tag leaving' : 'tag arriving'}
              style={{ ['--tilt' as string]: leaving != null && leaving <= 2 ? '-8deg' : '8deg' }}
              onAnimationEnd={(e) => {
                if (e.animationName === 'tag-off' && leaving != null) {
                  const score = leaving;
                  setLeaving(null);
                  onRate(head, score);
                }
              }}
              aria-labelledby="tag-title"
            >
              <div className="tag-photo">
                <img
                  src={head.image}
                  alt=""
                  width={400}
                  height={300}
                  loading="eager"
                  decoding="async"
                  onError={(e) => e.currentTarget.setAttribute('data-broken', '')}
                />
              </div>
              <p className="tag-cat">{categoryName(head.category)}</p>
              <h2 id="tag-title">{head.title}</h2>
              <div className="tag-meta">
                <span className="price">{price(head.priceCents)}</span>
                <span className="small muted">
                  {head.rating.toFixed(1).replace('.', ',')} sterren · {head.ratingCount.toLocaleString('nl-NL')}
                </span>
              </div>
              <p className="why">
                {(() => {
                  const [lead, rest] = splitReason(head.reason);
                  return rest ? (
                    <>
                      {lead} <strong>{rest}</strong>
                    </>
                  ) : (
                    lead
                  );
                })()}
              </p>
              <p className="small">
                <a className="btn quiet" href={`https://www.amazon.com/dp/${head.id}`} target="_blank" rel="noreferrer">
                  Bekijk bij Amazon
                </a>
              </p>
            </article>
            <div className="score">
              <p className="score-label" aria-hidden="true">
                Hoe leuk vind je dit?
              </p>
              <ScoreRow label="Hoe leuk vind je dit?" onPick={pick} disabled={leaving != null} />
            </div>
          </div>
        ) : (
          <div className="state">
            <h2>{thinking ? 'Ideeën zoeken…' : 'Geen ideeën met deze filters'}</h2>
            {!thinking && <p className="muted">Maak de prijs ruimer of kies meer categorieën.</p>}
          </div>
        )}
      </div>

      <aside className="side">
        {queue.length > 1 && (
          <div className="panel">
            <h2>Hierna</h2>
            <ul className="queue">
              {queue.slice(1, 5).map((q) => (
                <li key={q.id}>
                  <img src={q.image} alt="" width={48} height={48} loading="lazy" />
                  <span className="clip">{q.title}</span>
                  <span className="muted">{price(q.priceCents)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </section>
  );
}

function FilterForm({ status, filters, onChange }: { status: Props['status']; filters: Filters; onChange: (f: Filters) => void }) {
  const [min, setMin] = useState(filters.minPriceCents != null ? String(filters.minPriceCents / 100) : '');
  const [max, setMax] = useState(filters.maxPriceCents != null ? String(filters.maxPriceCents / 100) : '');
  const selected = new Set(filters.categories ?? []);
  const toCents = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? undefined : Math.round(Number(v) * 100));
  const applyPrice = () => onChange({ ...filters, minPriceCents: toCents(min), maxPriceCents: toCents(max) });
  const toggle = (c: string) => {
    const next = new Set(selected);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    onChange({ ...filters, categories: [...next] });
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        applyPrice();
      }}
    >
      <div className="price-range">
        <label className="field">
          <span>Prijs vanaf ($)</span>
          <input type="number" inputMode="decimal" min={0} value={min} onChange={(e) => setMin(e.target.value)} onBlur={applyPrice} />
        </label>
        <label className="field">
          <span>Prijs tot ($)</span>
          <input type="number" inputMode="decimal" min={0} value={max} onChange={(e) => setMax(e.target.value)} onBlur={applyPrice} />
        </label>
      </div>
      <p className="small muted" style={{ margin: '0 0 8px' }}>
        Categorieën {selected.size ? `(${selected.size})` : '(alle)'}
      </p>
      <div className="chips">
        {status.categories.map((c) => (
          <button key={c} type="button" className="chip" aria-pressed={selected.has(c)} onClick={() => toggle(c)}>
            {categoryName(c)}
          </button>
        ))}
      </div>
    </form>
  );
}
