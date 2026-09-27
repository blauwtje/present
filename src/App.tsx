import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EngineClient, type Status } from './engine/client';
import type { ProfileData, SuggestedProduct } from './engine/protocol';
import type { Filters, Interest, Owned } from './engine/types';
import { openStore, type Store } from './store/db';
import { downloadBackup, mergeProfiles, parseBackup, toBackup } from './store/backup';
import { Loading } from './ui/Loading';
import { Suggestions } from './ui/Suggestions';
import { Profile } from './ui/Profile';
import { Rated } from './ui/Rated';
import { useSync } from './sync/useSync';
import { readLink, withoutAdd } from './sync/link';

/** Handle a personal link (`#k=`) and a one-time add link (`#add=`) before the profile loads. */
async function applyLink(store: Store) {
  const { token, add } = readLink(location.hash);
  if (add) {
    try {
      await store.mergeAll(parseBackup(add));
      await store.putChangedAt(Date.now());
    } catch {
      // A broken link adds nothing.
    }
    history.replaceState(null, '', `${location.pathname}${location.search}${withoutAdd(location.hash)}`);
  }
  if (token && (await store.getSync())?.token !== token) await store.putSync({ token });
}
import './styles.css';

type View = 'ideas' | 'profile' | 'rated';

const emptyProfile: ProfileData = { interests: [], owned: [], ratings: [] };
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export default function App() {
  const engine = useMemo(() => new EngineClient(new URL(`${import.meta.env.BASE_URL}catalog/`, location.href).href), []);
  const [status, setStatus] = useState<Status>(engine.status);
  const [store, setStore] = useState<Store | null>(null);
  const [profile, setProfile] = useState<ProfileData>(emptyProfile);
  const [filters, setFilters] = useState<Filters>({});
  const [queue, setQueue] = useState<SuggestedProduct[]>([]);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('ideas');
  const request = useRef(0);

  useEffect(() => engine.subscribe(setStatus), [engine]);

  useEffect(() => {
    openStore()
      .then(async (s) => {
        await applyLink(s);
        const [p, f] = await Promise.all([s.load(), s.getFilters()]);
        setStore(s);
        setProfile(p);
        setFilters(f);
      })
      .catch(() => setError('Je browser staat opslaan niet toe. Je scores worden niet bewaard.'));
  }, []);

  const ready = status.state === 'ready' && store !== null;

  /** Ask the worker for a fresh list; keep the card on screen in place. */
  const refresh = useCallback(
    (p: ProfileData, f: Filters, keep?: SuggestedProduct) => {
      const id = ++request.current;
      setThinking(true);
      engine
        .recommend(p, f, keep ? [keep.id] : [])
        .then((items) => {
          if (id !== request.current) return;
          setQueue(keep ? [keep, ...items] : items);
          setError(null);
        })
        .catch((e: Error) => id === request.current && setError(e.message))
        .finally(() => id === request.current && setThinking(false));
    },
    [engine],
  );

  useEffect(() => {
    // Only on first ready; later changes call refresh themselves.
    if (ready) void Promise.resolve().then(() => refresh(profile, filters));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const applySynced = useCallback(
    (data: ProfileData, f: Filters) => {
      setProfile(data);
      setFilters(f);
      if (status.state === 'ready') refresh(data, f);
    },
    [refresh, status.state],
  );
  const sync = useSync({ store, profile, filters, apply: applySynced });

  const update = (next: ProfileData, keepHead = false) => {
    sync.markChanged();
    setProfile(next);
    if (view === 'ideas' || keepHead) refresh(next, filters, keepHead ? queue[0] : undefined);
    else setQueue([]);
  };

  const rate = async (product: SuggestedProduct, score: number) => {
    if (!store) return;
    const rating = { productId: product.id, score, at: Date.now() };
    await store.putRating(rating);
    sync.markChanged();
    const next = { ...profile, ratings: [...profile.ratings.filter((r) => r.productId !== product.id), rating] };
    setProfile(next);
    const rest = queue.filter((q) => q.id !== product.id);
    setQueue(rest);
    refresh(next, filters, rest[0]);
  };

  const changeFilters = async (f: Filters) => {
    setFilters(f);
    await store?.putFilters(f);
    sync.markChanged();
    refresh(profile, f);
  };

  const profileActions = {
    saveInterest: async (i: Interest) => {
      await store?.putInterest(i);
      update({ ...profile, interests: [...profile.interests.filter((x) => x.id !== i.id), i] });
    },
    addInterest: async (text: string, weight: number) => {
      const i = { id: newId(), text, weight };
      await store?.putInterest(i);
      update({ ...profile, interests: [...profile.interests, i] });
    },
    removeInterest: async (id: string) => {
      await store?.deleteInterest(id);
      update({ ...profile, interests: profile.interests.filter((x) => x.id !== id) });
    },
    saveOwned: async (o: Owned) => {
      await store?.putOwned(o);
      update({ ...profile, owned: profile.owned.map((x) => (x.id === o.id ? o : x)) });
    },
    addOwned: async (text: string, rating: number, productId?: string) => {
      const o: Owned = { id: newId(), text, rating, ...(productId ? { productId } : {}) };
      await store?.putOwned(o);
      update({ ...profile, owned: [...profile.owned, o] });
    },
    removeOwned: async (id: string) => {
      await store?.deleteOwned(id);
      update({ ...profile, owned: profile.owned.filter((x) => x.id !== id) });
    },
    exportBackup: () => downloadBackup(toBackup(profile, filters)),
    importBackup: async (text: string) => {
      const b = parseBackup(text);
      await store?.mergeAll(b);
      update(mergeProfiles(profile, b));
      return `${b.interests.length} interesses, ${b.owned.length} spullen en ${b.ratings.length} scores toegevoegd.`;
    },
    search: (q: string) => engine.search(q),
    sync,
  };

  const changeRating = async (productId: string, score: number | null) => {
    if (!store) return;
    let ratings = profile.ratings.filter((r) => r.productId !== productId);
    if (score == null) await store.deleteRating(productId);
    else {
      const r = { productId, score, at: profile.ratings.find((x) => x.productId === productId)?.at ?? Date.now() };
      await store.putRating(r);
      ratings = [...ratings, r].sort((a, b) => a.at - b.at);
    }
    update({ ...profile, ratings });
  };

  const go = (v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
    if (v === 'ideas' && ready && queue.length === 0) refresh(profile, filters);
  };

  return (
    <>
      <div className="app">
        <div className="page">
          {status.state !== 'ready' ? (
            <Loading status={status} />
          ) : view === 'ideas' ? (
            <Suggestions
              queue={queue}
              thinking={thinking}
              error={error}
              status={status}
              profile={profile}
              filters={filters}
              onRate={rate}
              onFilters={changeFilters}
              onGoProfile={() => go('profile')}
            />
          ) : view === 'profile' ? (
            <Profile profile={profile} {...profileActions} />
          ) : (
            <Rated engine={engine} ratings={profile.ratings} onChange={changeRating} />
          )}
        </div>
      </div>
      <nav className="nav" aria-label="Hoofdmenu">
        <ul>
          <li>
            <button type="button" aria-current={view === 'ideas' ? 'page' : undefined} onClick={() => go('ideas')}>
              Ideeën
            </button>
          </li>
          <li>
            <button type="button" aria-current={view === 'profile' ? 'page' : undefined} onClick={() => go('profile')}>
              Profiel
            </button>
          </li>
          <li>
            <button type="button" aria-current={view === 'rated' ? 'page' : undefined} onClick={() => go('rated')}>
              Gescoord<span className="count">{profile.ratings.length || ''}</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
