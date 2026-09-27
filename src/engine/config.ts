/** Every tunable number of the recommender, in one place. */
export const config = {
  weights: {
    /** Similarity to the best-matching interest, scaled by its 1-5 weight. */
    interest: 1.0,
    /** Rocchio term: similarity to scored products, weighted by (score - 3). */
    liked: 0.9,
    /** Fit with things the user already has. */
    owned: 0.35,
    /** Bayesian average rating, 0..1. */
    quality: 0.15,
    /** Category affinity from scores, -1..1. */
    category: 0.2,
  },
  bayes: { priorMean: 4.3, priorCount: 200, low: 4.0, high: 5.0 },
  /** Category affinity shrinks toward 0 with few scores: n / (n + shrink). */
  categoryShrink: 3,
  /** Candidates at least this similar to an owned item count as the same thing. */
  nearDuplicate: 0.9,
  /** Candidates retrieved per signal. */
  topK: 300,
  /** Signals below this similarity add nothing. */
  minSimilarity: 0.15,
  mmrLambda: 0.7,
  feedSize: 30,
} as const;

export type Config = typeof config;
