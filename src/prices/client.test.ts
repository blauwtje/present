import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getOffers, getWorkerAddress, setWorkerAddress, type Offer } from './client';

// The test environment is Node, which has no localStorage; stub a minimal one.
if (typeof localStorage === 'undefined') {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  });
}

let n = 0;
const freshDbName = () => `test-prices-${n++}`;

const offer = (shop: string): Offer => ({ shop, price: 1000, shipping: 0, total: 1000, url: `https://${shop}.nl/x` });

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('worker address', () => {
  it('is empty until set, then persists through localStorage', () => {
    expect(getWorkerAddress()).toBe('');
    setWorkerAddress('https://prices.example.workers.dev');
    expect(getWorkerAddress()).toBe('https://prices.example.workers.dev');
  });
});

describe('getOffers', () => {
  it('fetches from the Worker and caches the result when there is no cache yet', async () => {
    setWorkerAddress('https://prices.example.workers.dev');
    const offers = [offer('bol.com')];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ offers }) });
    const dbName = freshDbName();

    const result = await getOffers('p1', 'lego set', { dbName, fetch: fetchMock, now: () => 1000 });

    expect(result).toEqual(offers);
    expect(fetchMock).toHaveBeenCalledWith('https://prices.example.workers.dev?q=lego%20set');
  });

  it('returns the cached offers without fetching again within 7 days', async () => {
    setWorkerAddress('https://prices.example.workers.dev');
    const offers = [offer('coolblue')];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ offers }) });
    const dbName = freshDbName();
    const day = 24 * 60 * 60 * 1000;

    await getOffers('p1', 'lego set', { dbName, fetch: fetchMock, now: () => 0 });
    const result = await getOffers('p1', 'lego set', { dbName, fetch: fetchMock, now: () => 6 * day });

    expect(result).toEqual(offers);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refetches once the cache is older than 7 days', async () => {
    setWorkerAddress('https://prices.example.workers.dev');
    const older = [offer('coolblue')];
    const newer = [offer('bol.com')];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ offers: older }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ offers: newer }) });
    const dbName = freshDbName();
    const day = 24 * 60 * 60 * 1000;

    await getOffers('p1', 'lego set', { dbName, fetch: fetchMock, now: () => 0 });
    const result = await getOffers('p1', 'lego set', { dbName, fetch: fetchMock, now: () => 8 * day });

    expect(result).toEqual(newer);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns [] when no Worker address is configured', async () => {
    const dbName = freshDbName();
    const fetchMock = vi.fn();

    const result = await getOffers('p1', 'lego set', { dbName, fetch: fetchMock, now: () => 0 });

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to stale cache when a refetch fails', async () => {
    setWorkerAddress('https://prices.example.workers.dev');
    const stale = [offer('coolblue')];
    const dbName = freshDbName();
    const day = 24 * 60 * 60 * 1000;
    const okFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ offers: stale }) });
    await getOffers('p1', 'lego set', { dbName, fetch: okFetch, now: () => 0 });

    const failingFetch = vi.fn().mockRejectedValue(new Error('network down'));
    const result = await getOffers('p1', 'lego set', { dbName, fetch: failingFetch, now: () => 8 * day });

    expect(result).toEqual(stale);
  });

  it('returns [] when there is no cache and the Worker errors', async () => {
    setWorkerAddress('https://prices.example.workers.dev');
    const dbName = freshDbName();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ offers: [] }) });

    const result = await getOffers('p1', 'lego set', { dbName, fetch: fetchMock, now: () => 0 });

    expect(result).toEqual([]);
  });

  it('caches offers separately per product id', async () => {
    setWorkerAddress('https://prices.example.workers.dev');
    const dbName = freshDbName();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ offers: [offer('bol.com')] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ offers: [offer('coolblue')] }) });

    const a = await getOffers('p1', 'a', { dbName, fetch: fetchMock, now: () => 0 });
    const b = await getOffers('p2', 'b', { dbName, fetch: fetchMock, now: () => 0 });

    expect(a).toEqual([offer('bol.com')]);
    expect(b).toEqual([offer('coolblue')]);
  });
});
