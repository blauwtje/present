import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openStore } from './db';
import { parseBackup, toBackup } from './backup';

let n = 0;
const fresh = () => openStore(`test-${n++}`);

describe('store', () => {
  it('adds, updates and deletes interests, owned items and ratings', async () => {
    const s = await fresh();
    await s.putInterest({ id: 'i1', text: 'koken', weight: 4 });
    await s.putInterest({ id: 'i1', text: 'koken', weight: 5 });
    await s.putOwned({ id: 'o1', text: 'gitaar' });
    await s.putRating({ productId: 'B2', score: 2, at: 2 });
    await s.putRating({ productId: 'A1', score: 5, at: 1 });
    await s.putRating({ productId: 'B2', score: 4, at: 3 });
    let data = await s.load();
    expect(data.interests).toEqual([{ id: 'i1', text: 'koken', weight: 5 }]);
    expect(data.ratings.map((r) => [r.productId, r.score])).toEqual([['A1', 5], ['B2', 4]]);
    await s.deleteOwned('o1');
    await s.deleteRating('A1');
    data = await s.load();
    expect(data.owned).toEqual([]);
    expect(data.ratings).toHaveLength(1);
  });

  it('keeps filters', async () => {
    const s = await fresh();
    expect(await s.getFilters()).toEqual({});
    await s.putFilters({ maxPriceCents: 5000, categories: ['Books'] });
    expect(await s.getFilters()).toEqual({ maxPriceCents: 5000, categories: ['Books'] });
  });

  it('round-trips a backup', async () => {
    const a = await fresh();
    await a.putInterest({ id: 'i1', text: 'wandelen', weight: 3 });
    await a.putRating({ productId: 'X', score: 1, at: 5 });
    const text = JSON.stringify(toBackup(await a.load(), { minPriceCents: 1000 }));
    const b = await fresh();
    await b.putOwned({ id: 'old', text: 'weg' });
    await b.replaceAll(parseBackup(text));
    const data = await b.load();
    expect(data.interests[0].text).toBe('wandelen');
    expect(data.owned).toEqual([]);
    expect(data.ratings[0].score).toBe(1);
    expect(await b.getFilters()).toEqual({ minPriceCents: 1000 });
  });

  it('rejects files that are not a backup and drops bad rows', () => {
    expect(() => parseBackup('nope')).toThrow();
    expect(() => parseBackup('{"app":"x"}')).toThrow();
    const b = parseBackup(JSON.stringify({ app: 'cadeau', version: 1, interests: [{ id: 'a', text: 't', weight: 9 }], ratings: [] }));
    expect(b.interests).toEqual([]);
  });
});
