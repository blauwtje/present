import { useEffect, useState } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import type { Status } from '../engine/client';
import type { ProfileData, SuggestedProduct } from '../engine/protocol';
import type { Filters } from '../engine/types';
import { categoryName } from '../engine/reason';
import { USD_TO_EUR, categoryHueIndex, price } from './format';
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

const DRAG_COMMIT_PX = 120;
const DRAG_COMMIT_VELOCITY = 500;
const FLY_OFF_PX = 560;

export function Suggestions({ queue, thinking, error, status, profile, filters, onRate, onFilters, onGoProfile }: Props) {
  const head = queue[0];
  const peek = queue[1];
  const [busy, setBusy] = useState(false);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-FLY_OFF_PX, 0, FLY_OFF_PX], [-16, 0, 16]);
  const dragT = useTransform(x, [-160, 0, 160], [-1, 0, 1]);
  const posOpacity = useTransform(dragT, (v) => Math.max(v, 0));
  const negOpacity = useTransform(dragT, (v) => Math.max(-v, 0));
  const model = status.model;
  const modelLoading = model && model.total > 0 && model.loaded < model.total;
  const needsProfile = profile.interests.length === 0 && profile.owned.length === 0 && profile.ratings.length < 3;

  // A new head means the previous card already left; reset the drag position for the fresh card.
  useEffect(() => {
    x.set(0);
  }, [head?.id, x]);

  // Score commits go through this path whether triggered by a drag release or a ScoreRow tap,
  // so both share the same fly-off + onRate call the brief asks for.
  const commit = (score: number) => {
    if (!head || busy) return;
    setBusy(true);
    const dir = score <= 2 ? -1 : 1;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onRate(head, score);
      setBusy(false);
      return;
    }
    animate(x, dir * FLY_OFF_PX, { type: 'spring', stiffness: 420, damping: 34 }).then(() => {
      onRate(head, score);
      setBusy(false);
    });
  };

  const onDragEnd = (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    if (busy || !head) return;
    if (info.offset.x > DRAG_COMMIT_PX || info.velocity.x > DRAG_COMMIT_VELOCITY) commit(4);
    else if (info.offset.x < -DRAG_COMMIT_PX || info.velocity.x < -DRAG_COMMIT_VELOCITY) commit(2);
    // Below threshold: dragConstraints={{left:0,right:0}} springs the card back to 0 on its own.
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
            <motion.button whileTap={{ scale: 0.96 }} type="button" className="btn quiet" onClick={onGoProfile}>
              Naar profiel
            </motion.button>
          </p>
        )}
        {error && <p className="notice" data-tone="negative">{error}</p>}

        {head ? (
          <div className="tag-wrap" style={{ ['--cat-h' as string]: `var(--hue-cat-${categoryHueIndex(head.category)})` }}>
            {peek && (
              <div
                className="tag-peek"
                aria-hidden="true"
                style={{ ['--cat-h' as string]: `var(--hue-cat-${categoryHueIndex(peek.category)})` }}
              />
            )}
            <motion.article
              key={head.id}
              className="tag"
              style={{ x, rotate }}
              drag={busy ? false : 'x'}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.6}
              onDragEnd={onDragEnd}
              initial={{ scale: 0.94, y: 16, opacity: 0.5 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              aria-labelledby="tag-title"
            >
              <motion.div className="tag-tint pos" style={{ opacity: posOpacity }} aria-hidden="true">
                Leuk
              </motion.div>
              <motion.div className="tag-tint neg" style={{ opacity: negOpacity }} aria-hidden="true">
                Liever niet
              </motion.div>
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
              {/* Task 5's "Vergelijk prijzen" block lands here, below the price/reason and above the link. */}
              <div className="tag-prices-slot" />
              <p className="small">
                <a className="btn quiet" href={`https://www.amazon.com/dp/${head.id}`} target="_blank" rel="noreferrer">
                  Bekijk bij Amazon
                </a>
              </p>
            </motion.article>
            <div className="score">
              <p className="score-label" aria-hidden="true">
                Hoe leuk vind je dit? Sleep de kaart, of kies een cijfer.
              </p>
              <ScoreRow label="Hoe leuk vind je dit?" onPick={commit} disabled={busy} />
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
                  <span
                    className="rated-thumb rated-thumb--hued"
                    style={{ ['--cat-h' as string]: `var(--hue-cat-${categoryHueIndex(q.category)})` }}
                  >
                    <img
                      src={q.image}
                      alt=""
                      width={48}
                      height={48}
                      loading="lazy"
                      onError={(e) => e.currentTarget.setAttribute('data-broken', '')}
                    />
                  </span>
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

// Catalog prices are USD cents; filter inputs convert with the same rate as price().
const centsToEuroInput = (cents: number) => Math.round((cents / 100) * USD_TO_EUR).toString();
const euroInputToCents = (v: string): number | undefined => {
  if (v.trim() === '' || Number.isNaN(Number(v))) return undefined;
  return Math.round((Number(v) / USD_TO_EUR) * 100);
};

function FilterForm({ status, filters, onChange }: { status: Props['status']; filters: Filters; onChange: (f: Filters) => void }) {
  const [min, setMin] = useState(filters.minPriceCents != null ? centsToEuroInput(filters.minPriceCents) : '');
  const [max, setMax] = useState(filters.maxPriceCents != null ? centsToEuroInput(filters.maxPriceCents) : '');
  const selected = new Set(filters.categories ?? []);
  const applyPrice = () => onChange({ ...filters, minPriceCents: euroInputToCents(min), maxPriceCents: euroInputToCents(max) });
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
          <span>Prijs vanaf (€, ca.)</span>
          <input type="number" inputMode="decimal" min={0} value={min} onChange={(e) => setMin(e.target.value)} onBlur={applyPrice} />
        </label>
        <label className="field">
          <span>Prijs tot (€, ca.)</span>
          <input type="number" inputMode="decimal" min={0} value={max} onChange={(e) => setMax(e.target.value)} onBlur={applyPrice} />
        </label>
      </div>
      <p className="small muted" style={{ margin: '0 0 8px' }}>
        Categorieën {selected.size ? `(${selected.size})` : '(alle)'}
      </p>
      <div className="chips">
        {status.categories.map((c) => (
          <motion.button
            key={c}
            type="button"
            className="chip"
            whileTap={{ scale: 0.94 }}
            aria-pressed={selected.has(c)}
            onClick={() => toggle(c)}
          >
            {categoryName(c)}
          </motion.button>
        ))}
      </div>
    </form>
  );
}
