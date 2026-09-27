import { config as defaults, type Config } from './config';
import type { ReasonKind } from './types';

export interface LabeledSim {
  sim: number;
  label: string;
}

export interface CandidateInput {
  /** Similarity to each interest with its 1-5 weight. */
  interests: (LabeledSim & { weight: number })[];
  /** Similarity to each scored product with its 1-5 score. */
  rated: (LabeledSim & { score: number })[];
  /** Similarity to each owned item. */
  owned: LabeledSim[];
  rating: number;
  ratingCount: number;
  /** Category affinity, -1..1. */
  categoryAffinity: number;
}

export interface ScoreParts {
  interest: number;
  liked: number;
  owned: number;
  quality: number;
  category: number;
}

export interface Scored {
  parts: ScoreParts;
  total: number;
  reason: ReasonKind;
  /** The interest, product or owned item the reason names. */
  reasonLabel: string;
}

/** Bayesian average rating mapped to 0..1 over the configured range. */
export function bayesQuality(rating: number, count: number, cfg: Config = defaults): number {
  const { priorMean, priorCount, low, high } = cfg.bayes;
  const avg = (priorCount * priorMean + count * rating) / (priorCount + count);
  return Math.min(1, Math.max(0, (avg - low) / (high - low)));
}

/** Mean of (score - 3) / 2 per category, shrunk toward 0 when there are few scores. */
export function categoryAffinity(scores: { category: string; score: number }[], cfg: Config = defaults): Map<string, number> {
  const sums = new Map<string, { sum: number; n: number }>();
  for (const { category, score } of scores) {
    const s = sums.get(category) ?? { sum: 0, n: 0 };
    s.sum += (score - 3) / 2;
    s.n += 1;
    sums.set(category, s);
  }
  const out = new Map<string, number>();
  for (const [cat, { sum, n }] of sums) out.set(cat, (sum / n) * (n / (n + cfg.categoryShrink)));
  return out;
}

/** True when the candidate is nearly the same thing as something the user has. */
export function isNearDuplicate(owned: LabeledSim[], cfg: Config = defaults): boolean {
  return owned.some((o) => o.sim > cfg.nearDuplicate);
}

function best<T extends LabeledSim>(items: T[], value: (t: T) => number): { value: number; label: string } {
  let top = { value: 0, label: '' };
  for (const it of items) {
    const v = value(it);
    if (v > top.value) top = { value: v, label: it.label };
  }
  return top;
}

/** Score one candidate; returns null for a near-duplicate of an owned item. */
export function scoreCandidate(input: CandidateInput, cfg: Config = defaults): Scored | null {
  if (isNearDuplicate(input.owned, cfg)) return null;
  const min = cfg.minSimilarity;
  const useful = (sim: number) => (sim > min ? sim : 0);

  const interest = best(input.interests, (i) => useful(i.sim) * (i.weight / 5));

  // Rocchio: centroid of scored products, weighted by (score - 3), normalized by total weight.
  let likedNum = 0;
  let likedDen = 0;
  const likedBest = { value: 0, label: '' };
  for (const r of input.rated) {
    const w = r.score - 3;
    if (w === 0) continue;
    likedNum += w * Math.max(0, r.sim);
    likedDen += Math.abs(w);
    const pull = w * useful(r.sim);
    if (pull > likedBest.value) Object.assign(likedBest, { value: pull, label: r.label });
  }
  const liked = likedDen ? likedNum / likedDen : 0;

  const owned = best(input.owned, (o) => useful(o.sim));

  const parts: ScoreParts = {
    interest: interest.value,
    liked,
    owned: owned.value,
    quality: bayesQuality(input.rating, input.ratingCount, cfg),
    category: input.categoryAffinity,
  };
  const w = cfg.weights;
  const contrib: Record<ReasonKind, number> = {
    interest: w.interest * parts.interest,
    liked: w.liked * parts.liked,
    owned: w.owned * parts.owned,
    quality: w.quality * parts.quality,
    category: w.category * parts.category,
  };
  const total = Object.values(contrib).reduce((a, b) => a + b, 0);

  // The reason names a personal signal when one contributes; quality only as last resort.
  const order: ReasonKind[] = ['interest', 'liked', 'owned', 'category'];
  let reason: ReasonKind = 'quality';
  let top = 0;
  for (const k of order) {
    if (contrib[k] > top) {
      top = contrib[k];
      reason = k;
    }
  }
  const labels: Record<ReasonKind, string> = {
    interest: interest.label,
    liked: likedBest.label,
    owned: owned.label,
    quality: '',
    category: '',
  };
  return { parts, total, reason, reasonLabel: labels[reason] };
}
