import { useState } from 'react';
import { motion } from 'motion/react';
import { getWorkerAddress, setWorkerAddress } from '../prices/client';

const tap = { scale: 0.96 };
const tapTransition = { duration: 0.15 };

/** A usable Worker address: an https URL, without a trailing slash. */
function addressFromInput(v: string): string | null {
  const t = v.trim().replace(/\/+$/, '');
  try {
    return new URL(t).protocol === 'https:' ? t : null;
  } catch {
    return null;
  }
}

/** The price helper address: the user's own Worker that looks up Dutch shop prices. */
export function PriceSetup() {
  const [saved, setSaved] = useState(getWorkerAddress);
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState(false);

  function save(address: string) {
    setWorkerAddress(address);
    setSaved(address);
    setInput('');
    setEditing(false);
  }

  if (saved && !editing) {
    return (
      <div>
        <h2>Prijshulp</h2>
        <p className="small" role="status">
          Ingesteld. &ldquo;Vergelijk prijzen&rdquo; haalt prijzen op via <span className="price-helper-address">{saved}</span>.
        </p>
        <div className="backup">
          <motion.button className="btn" type="button" whileTap={tap} transition={tapTransition} onClick={() => { setInput(saved); setEditing(true); }}>
            Wijzigen
          </motion.button>
          <motion.button className="btn quiet" type="button" whileTap={tap} transition={tapTransition} onClick={() => save('')}>
            Verwijderen
          </motion.button>
        </div>
      </div>
    );
  }

  const address = addressFromInput(input);
  return (
    <div>
      <h2>Prijshulp</h2>
      <p className="small muted">
        Met een eigen prijshulp zie je bij elk idee wat bekende Nederlandse winkels vragen, inclusief verzending. Gratis, en eenmalig in te stellen.
      </p>
      <ol className="small how">
        <li>Maak een gratis account bij SerpApi en bij Cloudflare.</li>
        <li>
          Zet de prijshulp online met de stappen in <code>workers/prices/README.md</code>.
        </li>
        <li>Plak hier het adres dat Cloudflare je geeft.</li>
      </ol>
      <form
        className="add-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (address) save(address);
        }}
      >
        <label className="field">
          <span>Adres van je prijshulp</span>
          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://prijzen.jouwnaam.workers.dev"
          />
        </label>
        <div className="backup">
          <motion.button className="btn primary" type="submit" whileTap={tap} transition={tapTransition} disabled={!address}>
            Opslaan
          </motion.button>
          {editing && (
            <button className="btn quiet" type="button" onClick={() => setEditing(false)}>
              Annuleren
            </button>
          )}
        </div>
      </form>
      {input.trim() !== '' && !address && <p className="small muted">Het adres begint met https://</p>}
    </div>
  );
}
