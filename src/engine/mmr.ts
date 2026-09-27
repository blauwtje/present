/**
 * Maximal marginal relevance: pick `k` candidates, each time the one with the best
 * `lambda * relevance - (1 - lambda) * max similarity to anything already picked`.
 * Relevance is scaled to 0..1 first (divided by the maximum, or min-max when negatives occur)
 * so it lives on the same scale as similarity.
 * Returns positions into `relevance` in pick order.
 */
export function mmr(relevance: number[], similarity: (a: number, b: number) => number, k: number, lambda: number): number[] {
  const n = relevance.length;
  if (n === 0 || k <= 0) return [];
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of relevance) {
    if (r < lo) lo = r;
    if (r > hi) hi = r;
  }
  const rel = lo >= 0 && hi > 0 ? relevance.map((r) => r / hi) : relevance.map((r) => (r - lo) / (hi - lo || 1));
  const maxSim = new Float64Array(n).fill(-Infinity);
  const taken = new Uint8Array(n);
  const picked: number[] = [];
  while (picked.length < Math.min(k, n)) {
    let bestIdx = -1;
    let bestVal = -Infinity;
    for (let i = 0; i < n; i++) {
      if (taken[i]) continue;
      const penalty = picked.length ? maxSim[i] : 0;
      const val = lambda * rel[i] - (1 - lambda) * penalty;
      if (val > bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    }
    taken[bestIdx] = 1;
    picked.push(bestIdx);
    for (let i = 0; i < n; i++) {
      if (taken[i]) continue;
      const s = similarity(i, bestIdx);
      if (s > maxSim[i]) maxSim[i] = s;
    }
  }
  return picked;
}
