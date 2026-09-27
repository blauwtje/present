import { describe, expect, it } from 'vitest';
import { bayesQuality, categoryAffinity, scoreCandidate, type CandidateInput } from './score';

const base: CandidateInput = {
  interests: [],
  rated: [],
  owned: [],
  rating: 4.5,
  ratingCount: 500,
  categoryAffinity: 0,
};

describe('bayesQuality', () => {
  it('pulls few ratings toward the prior', () => {
    expect(bayesQuality(5, 10)).toBeLessThan(bayesQuality(5, 5000));
    expect(bayesQuality(5, 5000)).toBeGreaterThan(0.9);
  });
  it('stays within 0..1', () => {
    expect(bayesQuality(1, 100000)).toBe(0);
    expect(bayesQuality(5, 1e9)).toBeLessThanOrEqual(1);
  });
});

describe('categoryAffinity', () => {
  it('is positive for liked categories and shrinks with few scores', () => {
    const one = categoryAffinity([{ category: 'Books', score: 5 }]).get('Books')!;
    const many = categoryAffinity(Array(10).fill({ category: 'Books', score: 5 })).get('Books')!;
    expect(one).toBeGreaterThan(0);
    expect(many).toBeGreaterThan(one);
    expect(categoryAffinity([{ category: 'Toys', score: 1 }]).get('Toys')).toBeLessThan(0);
  });
});

describe('scoreCandidate', () => {
  it('ranks a closer interest match higher and weighs the interest', () => {
    const near = scoreCandidate({ ...base, interests: [{ sim: 0.7, weight: 5, label: 'koken' }] })!;
    const far = scoreCandidate({ ...base, interests: [{ sim: 0.3, weight: 5, label: 'koken' }] })!;
    const light = scoreCandidate({ ...base, interests: [{ sim: 0.7, weight: 1, label: 'koken' }] })!;
    expect(near.total).toBeGreaterThan(far.total);
    expect(near.total).toBeGreaterThan(light.total);
    expect(near.reason).toBe('interest');
    expect(near.reasonLabel).toBe('koken');
  });

  it('raises neighbours of high scores and lowers neighbours of low scores', () => {
    const neutral = scoreCandidate(base)!;
    const liked = scoreCandidate({ ...base, rated: [{ sim: 0.8, score: 5, label: 'Thee' }] })!;
    const disliked = scoreCandidate({ ...base, rated: [{ sim: 0.8, score: 1, label: 'Sokken' }] })!;
    expect(liked.total).toBeGreaterThan(neutral.total);
    expect(disliked.total).toBeLessThan(neutral.total);
    expect(liked.reason).toBe('liked');
    expect(liked.reasonLabel).toBe('Thee');
  });

  it('ignores a score of 3', () => {
    const neutral = scoreCandidate(base)!;
    const three = scoreCandidate({ ...base, rated: [{ sim: 0.9, score: 3, label: 'x' }] })!;
    expect(three.total).toBeCloseTo(neutral.total);
  });

  it('rewards fit with owned items but drops near-duplicates', () => {
    const fit = scoreCandidate({ ...base, owned: [{ sim: 0.6, label: 'gitaar' }] })!;
    expect(fit.total).toBeGreaterThan(scoreCandidate(base)!.total);
    expect(fit.reason).toBe('owned');
    expect(scoreCandidate({ ...base, owned: [{ sim: 0.95, label: 'gitaar' }] })).toBeNull();
  });

  it('adds category affinity and quality', () => {
    const plain = scoreCandidate(base)!;
    expect(scoreCandidate({ ...base, categoryAffinity: 0.5 })!.total).toBeGreaterThan(plain.total);
    expect(scoreCandidate({ ...base, rating: 4.9, ratingCount: 20000 })!.total).toBeGreaterThan(plain.total);
    expect(plain.reason).toBe('quality');
  });
});
