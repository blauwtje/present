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

/** True when `value` looks like a valid `Offer`: numeric price/shipping/total, string shop/url. */
function isOffer(value: unknown): value is Offer {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.shop === 'string' &&
    typeof o.url === 'string' &&
    typeof o.price === 'number' &&
    typeof o.shipping === 'number' &&
    typeof o.total === 'number'
  );
}

/** Parses and validates a Worker reply body; null when it isn't `{ offers: Offer[] }`. */
function parseOffers(body: unknown): Offer[] | null {
  if (!body || typeof body !== 'object') return null;
  const offers = (body as { offers?: unknown }).offers;
  if (!Array.isArray(offers) || !offers.every(isOffer)) return null;
  return offers;
}

/**
 * Offers for `productId`, from the 7-day cache when fresh, otherwise fetched
 * from the configured Worker and cached. `query` is the search text sent to
 * the Worker so it can look the product up on Dutch shops.
 *
 * The Worker replies `{ offers }`. Returns the (possibly stale) cached offers when no Worker
 * address is configured. Throws when the Worker cannot be reached, replies with an error, or
 * sends a reply that isn't `{ offers: Offer[] }` and there is no stale cache to fall back on.
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
      if (cached) return cached.offers;
      throw new Error(`Prices Worker replied with status ${res.status}`);
    }
    const offers = parseOffers(await res.json());
    if (!offers) {
      if (cached) return cached.offers;
      throw new Error('Prices Worker sent an unexpected reply');
    }
    await db.put('offers', { at: now, offers }, productId);
    return offers;
  } catch (error) {
    if (cached) return cached.offers;
    throw error instanceof Error ? error : new Error('Failed to fetch prices');
  }
}
