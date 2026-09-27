// Cloudflare Worker: Dutch shop offers for a product, via SerpApi Google Shopping.
//
// GET /?q=<product name>
//   -> { offers: Offer[] }  sorted cheapest-total-first, allowlisted shops only.

export interface Offer {
  shop: string;
  price: number;
  shipping: number;
  total: number;
  url: string;
}

export interface Env {
  /** SerpApi API key, stored as a Worker secret (`wrangler secret put SERPAPI_KEY`). */
  SERPAPI_KEY: string;
  /** Origin allowed to call this Worker via CORS, e.g. "https://cadeau.example". "*" allows any origin. */
  ALLOWED_ORIGIN?: string;
}

/**
 * Known Dutch shops. Prices from any other shop are dropped. Edit this list to
 * add or remove shops; matching is case-insensitive and ignores punctuation.
 */
export const ALLOWED_SHOPS = [
  'bol.com',
  'Coolblue',
  'MediaMarkt',
  'Amazon.nl',
  'Wehkamp',
  'Alternate',
  'Azerty',
  'Megekko',
  'Paradigit',
  'Artencraft',
  'BCC',
  'Expert',
  'Blokker',
  'HEMA',
  'Decathlon',
  'Intertoys',
  'Bever',
  'Zalando',
] as const;

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '');
}

const ALLOWED_LOOKUP = new Map(ALLOWED_SHOPS.map((shop) => [normalize(shop), shop]));

/** Returns the canonical allowlisted shop name for a store label, or null if unknown. */
export function matchAllowedShop(storeName: string | undefined | null): string | null {
  if (!storeName) return null;
  return ALLOWED_LOOKUP.get(normalize(storeName)) ?? null;
}

/** Parses a price/shipping value, including Dutch-formatted strings ("." thousands, "," decimal). */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d,.-]/g, '');
    const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned;
    const n = Number.parseFloat(normalized);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

interface SerpApiShoppingResult {
  immersive_product_page_token?: string;
}

interface SerpApiShoppingResponse {
  shopping_results?: SerpApiShoppingResult[];
}

interface SerpApiStore {
  name?: string;
  store?: string;
  link?: string;
  extracted_price?: unknown;
  price?: unknown;
  shipping_extracted?: unknown;
  shipping?: unknown;
  extracted_total?: unknown;
  total?: unknown;
}

interface SerpApiImmersiveResponse {
  stores?: SerpApiStore[];
}

/** Picks the first Immersive Product token out of a Google Shopping search response. */
export function pickImmersiveToken(shoppingResponse: SerpApiShoppingResponse): string | null {
  const results = shoppingResponse.shopping_results ?? [];
  for (const result of results) {
    if (result.immersive_product_page_token) return result.immersive_product_page_token;
  }
  return null;
}

/** Maps SerpApi Immersive Product stores into allowlisted, priced offers. */
export function mapStoresToOffers(immersiveResponse: SerpApiImmersiveResponse): Offer[] {
  const stores = immersiveResponse.stores ?? [];
  const offers: Offer[] = [];

  for (const store of stores) {
    const shop = matchAllowedShop(store.name ?? store.store ?? null);
    if (!shop || !store.link) continue;

    const shipping = toNumber(store.shipping_extracted ?? store.shipping) ?? 0;
    const total = toNumber(store.extracted_total ?? store.total);
    const price = toNumber(store.extracted_price ?? store.price);

    const resolvedTotal = total ?? (price !== null ? price + shipping : null);
    const resolvedPrice = price ?? (resolvedTotal !== null ? resolvedTotal - shipping : null);

    if (resolvedTotal === null || resolvedPrice === null) continue;

    offers.push({ shop, price: resolvedPrice, shipping, total: resolvedTotal, url: store.link });
  }

  return offers.sort((a, b) => a.total - b.total);
}

function serpApiUrl(params: Record<string, string>): string {
  const url = new URL('https://serpapi.com/search.json');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

/** Runs the two SerpApi calls (shopping search, then immersive product) and returns offers. */
export async function fetchOffers(query: string, apiKey: string): Promise<Offer[]> {
  const shoppingRes = await fetch(
    serpApiUrl({ engine: 'google_shopping', q: query, gl: 'nl', hl: 'nl', google_domain: 'google.nl', api_key: apiKey })
  );
  if (!shoppingRes.ok) throw new Error(`SerpApi shopping search failed: ${shoppingRes.status}`);
  const shoppingJson = (await shoppingRes.json()) as SerpApiShoppingResponse;

  const token = pickImmersiveToken(shoppingJson);
  if (!token) return [];

  const immersiveRes = await fetch(
    serpApiUrl({ engine: 'google_immersive_product', page_token: token, gl: 'nl', hl: 'nl', api_key: apiKey })
  );
  if (!immersiveRes.ok) throw new Error(`SerpApi immersive product failed: ${immersiveRes.status}`);
  const immersiveJson = (await immersiveRes.json()) as SerpApiImmersiveResponse;

  return mapStoresToOffers(immersiveJson);
}

function corsHeaders(env: Env): HeadersInit {
  const origin = env.ALLOWED_ORIGIN ?? '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function jsonResponse(body: unknown, status: number, env: Env): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Method not allowed' }, 405, env);
    }

    const query = new URL(request.url).searchParams.get('q')?.trim();
    if (!query) {
      return jsonResponse({ error: 'Missing "q" query parameter' }, 400, env);
    }

    if (!env.SERPAPI_KEY) {
      return jsonResponse({ error: 'Worker is missing SERPAPI_KEY' }, 500, env);
    }

    try {
      const offers = await fetchOffers(query, env.SERPAPI_KEY);
      return jsonResponse({ offers }, 200, env);
    } catch (error) {
      return jsonResponse({ error: (error as Error).message }, 502, env);
    }
  },
};
