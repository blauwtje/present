import { useState } from 'react';
import { motion } from 'motion/react';
import { getOffers, getWorkerAddress, type Offer } from '../prices/client';

interface Props {
  productId: string;
  query: string;
  onGoProfile: () => void;
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'setup' }
  | { kind: 'done'; offers: Offer[] };

const euro = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });

/** Live Dutch shop prices for one product, fetched only after a tap. */
export function Prices({ productId, query, onGoProfile }: Props) {
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function compare() {
    setState({ kind: 'loading' });
    const offers = await getOffers(productId, query);
    if (offers.length === 0 && !getWorkerAddress()) {
      setState({ kind: 'setup' });
      return;
    }
    setState({ kind: 'done', offers: [...offers].sort((a, b) => a.total - b.total) });
  }

  return (
    // Keeps a tap or scroll inside the list from starting a card swipe.
    <div className="prices" onPointerDown={(e) => e.stopPropagation()}>
      {state.kind === 'idle' && (
        <motion.button type="button" className="btn prices-open" whileTap={{ scale: 0.96 }} onClick={compare}>
          Vergelijk prijzen
        </motion.button>
      )}
      {state.kind === 'loading' && (
        <p className="prices-status searching" role="status">
          Prijzen zoeken bij Nederlandse winkels…
        </p>
      )}
      {state.kind === 'setup' && (
        <div className="notice" role="status">
          <p>Om prijzen te vergelijken heb je eerst een prijshulp nodig. Vul het adres in bij je profiel.</p>
          <button type="button" className="btn quiet" onClick={onGoProfile}>
            Naar profiel
          </button>
        </div>
      )}
      {state.kind === 'done' && state.offers.length === 0 && (
        <p className="prices-status" role="status">
          Geen bekende Nederlandse winkel verkoopt dit nu.
        </p>
      )}
      {state.kind === 'done' && state.offers.length > 0 && (
        <section className="prices-list" aria-label="Prijzen in Nederland">
          <h3>Prijzen in Nederland</h3>
          <ol>
            {state.offers.map((o, i) => (
              <motion.li
                key={`${o.shop}-${o.url}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.22 }}
                data-best={i === 0 ? '' : undefined}
              >
                <a href={o.url} target="_blank" rel="noreferrer" className="prices-shop">
                  {o.shop}
                </a>
                <span className="prices-parts">
                  {euro.format(o.price)} + {o.shipping === 0 ? 'gratis verzending' : `${euro.format(o.shipping)} verzending`}
                </span>
                <span className="prices-total">{euro.format(o.total)}</span>
              </motion.li>
            ))}
          </ol>
          <p className="small muted">Totaal inclusief verzending. Goedkoopste bovenaan.</p>
        </section>
      )}
    </div>
  );
}
