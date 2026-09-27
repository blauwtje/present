import { useEffect, useState } from 'react';
import type { EngineClient } from '../engine/client';
import type { Product, Rating } from '../engine/types';
import { categoryHueIndex, price } from './format';
import { ScoreRow } from './ScoreRow';

interface Props {
  engine: EngineClient;
  ratings: Rating[];
  onChange: (productId: string, score: number | null) => void;
}

export function Rated({ engine, ratings, onChange }: Props) {
  const [products, setProducts] = useState<Map<string, Product>>(new Map());
  const ids = ratings.map((r) => r.productId).join(',');

  useEffect(() => {
    if (!ids) return;
    let live = true;
    engine.products(ids.split(',')).then((items) => live && setProducts(new Map(items.map((p) => [p.id, p]))));
    return () => {
      live = false;
    };
  }, [engine, ids]);

  const newestFirst = [...ratings].sort((a, b) => b.at - a.at);
  return (
    <section>
      <div className="page-head">
        <h1>Gescoord</h1>
        <span className="small muted">{ratings.length === 1 ? '1 product' : `${ratings.length} producten`}</span>
      </div>
      {ratings.length === 0 ? (
        <p className="rated-empty muted">Nog niets gescoord. Scores die je bij Ideeën geeft, komen hier.</p>
      ) : (
        <ul className="list rated">
          {newestFirst.map((r) => {
            const p = products.get(r.productId);
            const hue = p?.category ? categoryHueIndex(p.category) : null;
            return (
              <li key={r.productId}>
                {p ? (
                  <div
                    className={hue === null ? 'rated-thumb' : 'rated-thumb rated-thumb--hued'}
                    style={hue === null ? undefined : { ['--cat-h' as string]: `var(--hue-cat-${hue})` }}
                  >
                    <img src={p.image} alt="" width={40} height={40} loading="lazy" />
                  </div>
                ) : (
                  // Unresolved: rating exists, product record hasn't loaded (or was removed) yet.
                  <div className="rated-placeholder" aria-hidden="true" />
                )}
                <div style={{ minWidth: 0 }}>
                  <div className="row">
                    <span className="grow clip">{p?.title ?? r.productId}</span>
                    <button className="btn quiet" type="button" onClick={() => onChange(r.productId, null)} aria-label={`Score wissen voor ${p?.title ?? r.productId}`}>
                      Wis
                    </button>
                  </div>
                  {p && <span className="small muted">{price(p.priceCents)}</span>}
                  <ScoreRow compact value={r.score} label={`Score voor ${p?.title ?? r.productId}`} onPick={(s) => onChange(r.productId, s)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
