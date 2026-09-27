import { useEffect, useRef, useState } from 'react';
import type { ProfileData } from '../engine/protocol';
import type { Interest, Owned, Product } from '../engine/types';
import { price } from './format';
import { Sync } from './Sync';
import type { useSync } from '../sync/useSync';

interface Props {
  profile: ProfileData;
  saveInterest: (i: Interest) => Promise<void>;
  addInterest: (text: string, weight: number) => Promise<void>;
  removeInterest: (id: string) => Promise<void>;
  addOwned: (text: string, rating: number, productId?: string) => Promise<void>;
  saveOwned: (o: Owned) => Promise<void>;
  removeOwned: (id: string) => Promise<void>;
  exportBackup: () => void;
  importBackup: (text: string) => Promise<string>;
  search: (q: string) => Promise<Product[]>;
  sync: ReturnType<typeof useSync>;
}

const weightWords = ['een beetje', 'wel', 'best veel', 'veel', 'heel veel'];

function Weight({ value, onPick, name }: { value: number; onPick: (w: number) => void; name: string }) {
  return (
    <div className="weight" role="group" aria-label={`Hoe belangrijk is ${name}?`}>
      {[1, 2, 3, 4, 5].map((w) => (
        <button key={w} type="button" aria-pressed={value === w} aria-label={`${w}: ${weightWords[w - 1]}`} onClick={() => onPick(w)}>
          {w}
        </button>
      ))}
      <span className="small muted">{weightWords[value - 1]}</span>
    </div>
  );
}

export function Profile(p: Props) {
  return (
    <section>
      <div className="page-head">
        <h1>Profiel</h1>
      </div>
      <div className="sections">
        <Interests {...p} />
        <OwnedList {...p} />
        <Sync sync={p.sync} />
        <Backup {...p} />
      </div>
    </section>
  );
}

function Interests({ profile, saveInterest, addInterest, removeInterest }: Props) {
  const [text, setText] = useState('');
  const [weight, setWeight] = useState(3);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    await addInterest(t, weight);
    setText('');
    setWeight(3);
  };
  return (
    <div>
      <h2>Wat ik leuk vind</h2>
      <p className="small muted">Schrijf het zoals je het zegt, bijvoorbeeld &ldquo;koken met vrienden&rdquo; of &ldquo;oude jazzplaten&rdquo;.</p>
      <ul className="list">
        {profile.interests.map((i) => (
          <li key={i.id}>
            <div className="row">
              {editing === i.id ? (
                <form
                  className="row grow"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (draft.trim()) await saveInterest({ ...i, text: draft.trim() });
                    setEditing(null);
                  }}
                >
                  <input type="text" className="grow" aria-label="Interesse" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
                  <button className="btn" type="submit">
                    Klaar
                  </button>
                </form>
              ) : (
                <>
                  <span className="grow">{i.text}</span>
                  <button
                    className="btn quiet"
                    type="button"
                    onClick={() => {
                      setEditing(i.id);
                      setDraft(i.text);
                    }}
                  >
                    Wijzig
                  </button>
                  <button className="btn quiet" type="button" onClick={() => removeInterest(i.id)} aria-label={`Verwijder ${i.text}`}>
                    Weg
                  </button>
                </>
              )}
            </div>
            <Weight value={i.weight} name={i.text} onPick={(w) => saveInterest({ ...i, weight: w })} />
          </li>
        ))}
      </ul>
      <form
        className="add-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="field">
          <span>Nieuwe interesse</span>
          <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="bijv. wandelen in de bergen" enterKeyHint="done" />
        </label>
        <Weight value={weight} name="deze interesse" onPick={setWeight} />
        <div>
          <button className="btn primary" type="submit" disabled={!text.trim()}>
            Toevoegen
          </button>
        </div>
      </form>
    </div>
  );
}

function RatingSelect({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <label className="rating-select">
      <span className="visually-hidden">{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {Array.from({ length: 10 }, (_, i) => 10 - i).map((n) => (
          <option key={n} value={n}>
            {n}/10
          </option>
        ))}
      </select>
    </label>
  );
}

function OwnedList({ profile, addOwned, saveOwned, removeOwned, search }: Props) {
  const [text, setText] = useState('');
  const [rating, setRating] = useState(8);
  const [picks, setPicks] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const q = text.trim();
    const id = ++seq.current;
    if (q.length < 3) return;
    const t = setTimeout(() => {
      setSearching(true);
      search(q)
        .then((items) => id === seq.current && setPicks(items.slice(0, 5)))
        .catch(() => id === seq.current && setPicks([]))
        .finally(() => id === seq.current && setSearching(false));
    }, 350);
    return () => clearTimeout(t);
  }, [text, search]);

  const add = async (label: string, productId?: string) => {
    await addOwned(label, rating, productId);
    setText('');
    setPicks([]);
  };
  const shownPicks = text.trim().length >= 3 ? picks : [];

  return (
    <div>
      <h2>Heb ik al</h2>
      <p className="small muted">Dit krijg je niet nog eens. Wel dingen die erbij passen. Het cijfer zegt hoe blij je ermee bent: hoe hoger, hoe meer het meetelt.</p>
      <ul className="list">
        {profile.owned.map((o) => (
          <li key={o.id} className="row">
            <span className="grow">
              {o.text}
              {o.productId && <span className="small muted"> · uit de catalogus</span>}
            </span>
            <RatingSelect value={o.rating ?? 7} label={`Cijfer voor ${o.text}`} onChange={(r) => saveOwned({ ...o, rating: r })} />
            <button className="btn quiet" type="button" onClick={() => removeOwned(o.id)} aria-label={`Verwijder ${o.text}`}>
              Weg
            </button>
          </li>
        ))}
      </ul>
      <form
        className="add-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void add(text.trim());
        }}
      >
        <div className="field">
          <span id="owned-label">Iets dat je al hebt</span>
          <span className="row">
            <input type="search" aria-labelledby="owned-label" className="grow" value={text} onChange={(e) => setText(e.target.value)} placeholder="bijv. Kindle, espressomachine" enterKeyHint="done" />
            <RatingSelect value={rating} label="Cijfer" onChange={setRating} />
          </span>
        </div>
        {shownPicks.length > 0 && (
          <ul className="picks" aria-label="Uit de catalogus">
            {shownPicks.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => add(p.title, p.id)}>
                  <img src={p.image} alt="" width={40} height={40} loading="lazy" />
                  <span className="clip small">
                    {p.title} <span className="muted">· {price(p.priceCents)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <button className="btn primary" type="submit" disabled={!text.trim()}>
            Toevoegen als tekst
          </button>
          {searching && <span className="small muted">Zoeken…</span>}
        </div>
      </form>
    </div>
  );
}

function Backup({ exportBackup, importBackup }: Props) {
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  return (
    <div>
      <h2>Backup</h2>
      <p className="small muted">Een los bestand met al je gegevens, als extra zekerheid.</p>
      <div className="backup">
        <button className="btn" type="button" onClick={exportBackup}>
          Backup opslaan
        </button>
        <button className="btn" type="button" onClick={() => file.current?.click()}>
          Backup terugzetten
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              setMsg(await importBackup(await f.text()));
            } catch (err) {
              setMsg(err instanceof Error ? err.message : 'Terugzetten lukte niet.');
            }
          }}
        />
      </div>
      {msg && (
        <p className="notice" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
