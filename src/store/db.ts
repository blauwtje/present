import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Filters, Interest, Owned, Rating } from '../engine/types';
import type { ProfileData } from '../engine/protocol';

interface CadeauDB extends DBSchema {
  interests: { key: string; value: Interest };
  owned: { key: string; value: Owned };
  ratings: { key: string; value: Rating };
  settings: { key: string; value: unknown };
}

export const DB_NAME = 'cadeau';
const VERSION = 1;

export type Store = ReturnType<typeof makeStore>;

export function makeStore(db: IDBPDatabase<CadeauDB>) {
  return {
    async load(): Promise<ProfileData> {
      const [interests, owned, ratings] = await Promise.all([db.getAll('interests'), db.getAll('owned'), db.getAll('ratings')]);
      return { interests, owned, ratings: ratings.sort((a, b) => a.at - b.at) };
    },
    putInterest: (i: Interest) => db.put('interests', i),
    deleteInterest: (id: string) => db.delete('interests', id),
    putOwned: (o: Owned) => db.put('owned', o),
    deleteOwned: (id: string) => db.delete('owned', id),
    putRating: (r: Rating) => db.put('ratings', r, r.productId),
    deleteRating: (productId: string) => db.delete('ratings', productId),
    async getFilters(): Promise<Filters> {
      return ((await db.get('settings', 'filters')) as Filters | undefined) ?? {};
    },
    putFilters: (f: Filters) => db.put('settings', f, 'filters'),
    /** Add everything in `data`, overwriting entries with the same id, in one transaction. */
    async mergeAll(data: ProfileData) {
      const tx = db.transaction(['interests', 'owned', 'ratings'], 'readwrite');
      await Promise.all([
        ...data.interests.map((i) => tx.objectStore('interests').put(i)),
        ...data.owned.map((o) => tx.objectStore('owned').put(o)),
        ...data.ratings.map((r) => tx.objectStore('ratings').put(r, r.productId)),
      ]);
      await tx.done;
    },
    /** Replace everything with `data` in one transaction. */
    async replaceAll(data: ProfileData & { filters?: Filters }) {
      const tx = db.transaction(['interests', 'owned', 'ratings', 'settings'], 'readwrite');
      await Promise.all([tx.objectStore('interests').clear(), tx.objectStore('owned').clear(), tx.objectStore('ratings').clear()]);
      await Promise.all([
        ...data.interests.map((i) => tx.objectStore('interests').put(i)),
        ...data.owned.map((o) => tx.objectStore('owned').put(o)),
        ...data.ratings.map((r) => tx.objectStore('ratings').put(r, r.productId)),
        tx.objectStore('settings').put(data.filters ?? {}, 'filters'),
      ]);
      await tx.done;
    },
  };
}

export async function openStore(name = DB_NAME): Promise<Store> {
  const db = await openDB<CadeauDB>(name, VERSION, {
    upgrade(d) {
      d.createObjectStore('interests', { keyPath: 'id' });
      d.createObjectStore('owned', { keyPath: 'id' });
      d.createObjectStore('ratings');
      d.createObjectStore('settings');
    },
  });
  return makeStore(db);
}
