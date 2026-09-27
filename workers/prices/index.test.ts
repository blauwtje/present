import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { mapStoresToOffers, matchAllowedShop, pickImmersiveToken } from './index';

const SHOPPING_RESPONSE = {
  shopping_results: [{ immersive_product_page_token: 'token-123' }],
};

const IMMERSIVE_RESPONSE = {
  stores: [
    { name: 'Coolblue', link: 'https://coolblue.nl/x', extracted_price: 120, shipping_extracted: 0 },
    { name: 'bol.com', link: 'https://bol.com/x', extracted_price: 110, shipping_extracted: 4.95 },
    { name: 'Some Random Marketplace Seller', link: 'https://sketchy.example/x', extracted_price: 50, shipping_extracted: 0 },
    { name: 'MediaMarkt', link: 'https://mediamarkt.nl/x', extracted_total: 118 },
  ],
};

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

describe('matchAllowedShop', () => {
  it('matches known shops case- and punctuation-insensitively', () => {
    expect(matchAllowedShop('BOL.COM')).toBe('bol.com');
    expect(matchAllowedShop('coolblue')).toBe('Coolblue');
  });

  it('rejects unknown shops', () => {
    expect(matchAllowedShop('Some Random Marketplace Seller')).toBeNull();
    expect(matchAllowedShop(null)).toBeNull();
  });
});

describe('pickImmersiveToken', () => {
  it('returns the first immersive product token', () => {
    expect(pickImmersiveToken(SHOPPING_RESPONSE)).toBe('token-123');
  });

  it('returns null when there are no results', () => {
    expect(pickImmersiveToken({})).toBeNull();
  });
});

describe('mapStoresToOffers', () => {
  it('keeps only allowlisted shops, computes totals, and sorts cheapest first', () => {
    const offers = mapStoresToOffers(IMMERSIVE_RESPONSE);

    expect(offers.map((o) => o.shop)).toEqual(['bol.com', 'MediaMarkt', 'Coolblue']);
    expect(offers.map((o) => o.total)).toEqual([114.95, 118, 120]);
    expect(offers[0]).toEqual({ shop: 'bol.com', price: 110, shipping: 4.95, total: 114.95, url: 'https://bol.com/x' });
  });
});

describe('worker fetch handler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('answers a GET with sorted, allowlisted offers and CORS headers', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(SHOPPING_RESPONSE))
        .mockResolvedValueOnce(jsonResponse(IMMERSIVE_RESPONSE))
    );

    const request = new Request('https://worker.example/?q=fiets');
    const response = await worker.fetch(request, { SERPAPI_KEY: 'test-key', ALLOWED_ORIGIN: 'https://cadeau.example' });

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://cadeau.example');

    const body = (await response.json()) as { offers: { shop: string }[] };
    expect(body.offers.map((o) => o.shop)).toEqual(['bol.com', 'MediaMarkt', 'Coolblue']);
  });

  it('rejects a request without a query', async () => {
    const request = new Request('https://worker.example/');
    const response = await worker.fetch(request, { SERPAPI_KEY: 'test-key' });
    expect(response.status).toBe(400);
  });

  it('answers an OPTIONS preflight with CORS headers and no body', async () => {
    const request = new Request('https://worker.example/', { method: 'OPTIONS' });
    const response = await worker.fetch(request, { SERPAPI_KEY: 'test-key', ALLOWED_ORIGIN: 'https://cadeau.example' });
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://cadeau.example');
  });
});
