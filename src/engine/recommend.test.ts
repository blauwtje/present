import { describe, expect, it } from 'vitest';
import { recommend, similarities, topK } from './recommend';
import type { Catalog, Manifest, MetaRow } from './types';

const dim = 4;
// Directions: 0 = cooking, 1 = music, 2 = sport, 3 = books.
const items: [string, number[], number, string][] = [
  ['pan', [1, 0, 0, 0], 2000, 'Home_and_Kitchen'],
  ['pan2', [0.99, 0.1, 0, 0], 2100, 'Home_and_Kitchen'],
  ['knife', [0.9, 0, 0.3, 0], 5000, 'Home_and_Kitchen'],
  ['guitar', [0, 1, 0, 0], 20000, 'Musical_Instruments'],
  ['strings', [0, 0.95, 0, 0.3], 900, 'Musical_Instruments'],
  ['ball', [0, 0, 1, 0], 1500, 'Sports_and_Outdoors'],
  ['novel', [0, 0, 0, 1], 1200, 'Books'],
  ['cookbook', [0.7, 0, 0, 0.7], 1800, 'Books'],
  ['wokpan', [0.8, 0, 0.6, 0], 3500, 'Home_and_Kitchen'],
];

function makeCatalog(): Catalog {
  const categories = [...new Set(items.map((i) => i[3]))];
  const vectors = new Int8Array(items.length * dim);
  const meta: MetaRow[] = items.map(([id, v, price, cat], i) => {
    const n = Math.hypot(...v);
    v.forEach((x, d) => (vectors[i * dim + d] = Math.round((x / n) * 127)));
    return [id, id, categories.indexOf(cat), 0, price, id, 45, 200];
  });
  const manifest = { version: 1, dim, count: items.length, categories, paths: ['p'] } as unknown as Manifest;
  return { manifest, dim, count: items.length, vectors, meta, byId: new Map(meta.map((m, i) => [m[0], i])) };
}

const vec = (...v: number[]) => new Float32Array(v);
const ids = (cat: Catalog, s: { index: number }[]) => s.map((x) => cat.meta[x.index][0]);

describe('similarities and topK', () => {
  it('finds the nearest products', () => {
    const cat = makeCatalog();
    const sims = similarities(cat, vec(0, 1, 0, 0));
    expect(sims[3]).toBeCloseTo(1, 1);
    expect(topK(sims, 2, () => true)).toEqual([3, 4]);
    expect(topK(sims, 2, (i) => i !== 3)).toEqual([4, expect.any(Number)]);
  });
});

describe('recommend', () => {
  const cat = makeCatalog();
  const cooking = { vector: vec(1, 0, 0, 0), weight: 5, label: 'koken' };

  it('puts interest matches first and explains them', () => {
    const out = recommend(cat, { interests: [cooking], rated: [], owned: [], filters: {}, count: 3 });
    expect(ids(cat, out)[0]).toBe('pan');
    expect(out[0].reason).toContain('koken');
  });

  it('diversifies near-identical products', () => {
    const music = { vector: vec(0, 1, 0, 0), weight: 4, label: 'muziek' };
    const out = recommend(cat, { interests: [cooking, music], rated: [], owned: [], filters: {}, count: 3 });
    expect(ids(cat, out).slice(0, 2)).toEqual(['pan', 'guitar']);
  });

  it('never shows rated or owned products and drops near-duplicates of owned text', () => {
    const out = recommend(cat, {
      interests: [cooking],
      rated: [{ index: 2, score: 4, label: 'knife' }],
      owned: [{ vector: vec(1, 0, 0, 0), label: 'mijn pan' }, { index: 6, label: 'novel' }],
      filters: {},
      count: 8,
    });
    const shown = ids(cat, out);
    expect(shown).not.toContain('knife');
    expect(shown).not.toContain('novel');
    expect(shown).not.toContain('pan');
    expect(shown).not.toContain('pan2');
  });

  it('drops a same-kind product as a near-duplicate of an owned item, even when it is not a close text match', () => {
    const out = recommend(cat, {
      interests: [cooking],
      rated: [],
      owned: [{ vector: vec(1, 0, 0, 0), label: 'mijn pan' }],
      filters: {},
      count: 8,
    });
    const shown = ids(cat, out);
    expect(shown).not.toContain('wokpan'); // sim 0.8: same kind as the owned pan, now caught by the lowered threshold
    expect(shown).toContain('cookbook'); // sim 0.707: not close enough to count as owned
  });

  it('a high score pulls its neighbours up, a low score pushes them down', () => {
    const liked = recommend(cat, { interests: [], rated: [{ index: 3, score: 5, label: 'guitar' }], owned: [], filters: {}, count: 3 });
    expect(ids(cat, liked)[0]).toBe('strings');
    const disliked = recommend(cat, { interests: [], rated: [{ index: 3, score: 1, label: 'guitar' }], owned: [], filters: {}, count: 8 });
    expect(ids(cat, disliked).at(-1)).toBe('strings');
  });

  it('applies price and category filters', () => {
    const out = recommend(cat, { interests: [cooking], rated: [], owned: [], filters: { maxPriceCents: 2000, categories: ['Home_and_Kitchen', 'Books'] }, count: 8 });
    expect(ids(cat, out).sort()).toEqual(['cookbook', 'novel', 'pan']);
  });

  it('gives a feed without any profile', () => {
    expect(recommend(cat, { interests: [], rated: [], owned: [], filters: {}, count: 5 })).toHaveLength(5);
  });
});
