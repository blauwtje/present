import { describe, expect, it } from 'vitest';
import { mmr } from './mmr';

// Items 0 and 1 are near-identical; item 2 is different but slightly less relevant.
const sims = [
  [1, 0.99, 0.1],
  [0.99, 1, 0.1],
  [0.1, 0.1, 1],
];
const sim = (a: number, b: number) => sims[a][b];

describe('mmr', () => {
  it('starts with the most relevant item', () => {
    expect(mmr([0.9, 0.85, 0.8], sim, 1, 0.7)).toEqual([0]);
  });

  it('prefers a different item over a near-copy of a picked one', () => {
    expect(mmr([0.9, 0.85, 0.8], sim, 3, 0.7)).toEqual([0, 2, 1]);
  });

  it('with lambda 1 keeps pure relevance order', () => {
    expect(mmr([0.9, 0.85, 0.8], sim, 3, 1)).toEqual([0, 1, 2]);
  });

  it('handles empty input and k larger than n', () => {
    expect(mmr([], sim, 5, 0.7)).toEqual([]);
    expect(mmr([0.5, 0.4, 0.3], sim, 10, 0.7)).toHaveLength(3);
  });

  it('never picks an item twice', () => {
    const picked = mmr([0.9, 0.9, 0.9], sim, 3, 0.5);
    expect(new Set(picked).size).toBe(3);
  });
});
