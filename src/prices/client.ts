import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/** One shop's offer for a product, as returned by the prices Worker. */
export interface Offer {
  shop: string;
  price: number;
  shipping: number;
  total: number;
  url: string;
}

interface PricesDB extends DBSchema {
  offers: { key: string; value: CachedOffers };
}

interface CachedOffers {
  at: number;
  offers: Offer[];
}

export const DB_NAME = 'cadeau-prices';
const VERSION = 1;
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const WORKER_ADDRESS_KEY = 'cadeau.pricesWorkerAddress';

/** The Worker address the user configured, or '' when none is set yet. */
export function getWorkerAddress(): string {
  try {
    return localStorage.getItem(WORKER_ADDRESS_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setWorkerAddress(address: string): void {
  try {
    localStorage.setItem(WORKER_ADDRESS_KEY, address);
  } catch {
    /* localStorage unavailable (e.g. private mode); nothing we can do. */
  }
}

export async function openPricesDB(name = DB_NAME): Promise<IDBPDatabase<PricesDB>> {
  return openDB<PricesDB>(name, VERSION, {
    upgrade(d) {
      d.createObjectStore('offers');
    },
  });
}

export interface GetOffersOptions {
  /** Override for the cache database name; tests use this for isolation. */
  dbName?: string;
  /** Override for "now", so freshness can be tested without a real clock. */
  now?: () => number;
  /** Override for fetch, so calls to the Worker can be tested. */
  fetch?: typeof fetch;
}

/**
 * Offers for `productId`, from the 7-day cache when fresh, otherwise fetched
 * from the configured Worker and cached. `query` is the search text sent to
 * the Worker so it can look the product up on Dutch shops.
 *
 * The Worker replies `{ offers }`. Returns the (possibly stale) cached offers, or `[]`, when no Worker
 * address is configured or the fetch fails.
 */
export async function getOffers(productId: string, query: string, options: GetOffersOptions = {}): Promise<Offer[]> {
  const now = options.now ? options.now() : Date.now();
  const doFetch = options.fetch ?? fetch;
  const db = await openPricesDB(options.dbName);
  const cached = await db.get('offers', productId);
  if (cached && now - cached.at < FRESH_MS) {
    return cached.offers;
  }

  const address = getWorkerAddress();
  if (!address) {
    return cached?.offers ?? [];
  }

  try {
    const res = await doFetch(`${address}?q=${encodeURIComponent(query)}`);
    if (!res.ok) {
      return cached?.offers ?? [];
    }
    const { offers } = (await res.json()) as { offers: Offer[] };
    await db.put('offers', { at: now, offers }, productId);
    return offers;
  } catch {
    return cached?.offers ?? [];
  }
}
