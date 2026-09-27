import { config as defaults, type Config } from './config';
import { mmr } from './mmr';
import { reasonText } from './reason';
import { bayesQuality, categoryAffinity, scoreCandidate, type CandidateInput } from './score';
import type { Catalog, Filters, Signal, Suggestion } from './types';

const Q = 127;

export interface RatedSignal {
  index: number;
  score: number;
  label: string;
}

export interface OwnedSignal {
  /** Text vector, or undefined when the item is a catalog product. */
  vector?: Float32Array;
  /** Catalog index when the item was picked from the catalog. */
  index?: number;
  label: string;
  /** 0..1, from the user's 1-10 rating of the item. */
  weight?: number;
}

export interface RecommendInput {
  interests: Signal[];
  rated: RatedSignal[];
  owned: OwnedSignal[];
  filters: Filters;
  /** Extra product indices never to show (for example the ones already queued). */
  exclude?: Set<number>;
  count?: number;
}

/** Float query against every product: one cosine per product. */
export function similarities(catalog: Catalog, query: Float32Array): Float32Array {
  const { vectors, dim, count } = catalog;
  const out = new Float32Array(count);
  for (let i = 0, off = 0; i < count; i++, off += dim) {
    let s = 0;
    for (let d = 0; d < dim; d++) s += vectors[off + d] * query[d];
    out[i] = s / Q;
  }
  return out;
}

export function rowVector(catalog: Catalog, index: number): Float32Array {
  const { vectors, dim } = catalog;
  const v = new Float32Array(dim);
  for (let d = 0; d < dim; d++) v[d] = vectors[index * dim + d] / Q;
  return v;
}

export function dotRows(catalog: Catalog, a: number, b: number): number {
  const { vectors, dim } = catalog;
  let s = 0;
  const oa = a * dim;
  const ob = b * dim;
  for (let d = 0; d < dim; d++) s += vectors[oa + d] * vectors[ob + d];
  return s / (Q * Q);
}

function dotRow(catalog: Catalog, index: number, query: Float32Array): number {
  const { vectors, dim } = catalog;
  let s = 0;
  const off = index * dim;
  for (let d = 0; d < dim; d++) s += vectors[off + d] * query[d];
  return s / Q;
}

/** Indices of the `k` highest values among allowed products. */
export function topK(values: ArrayLike<number>, k: number, allowed: (i: number) => boolean): number[] {
  const idx: number[] = [];
  const val: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (idx.length === k && v <= val[k - 1]) continue;
    if (!allowed(i)) continue;
    let pos = idx.length;
    while (pos > 0 && val[pos - 1] < v) pos--;
    idx.splice(pos, 0, i);
    val.splice(pos, 0, v);
    if (idx.length > k) {
      idx.pop();
      val.pop();
    }
  }
  return idx;
}

export function passesFilters(catalog: Catalog, index: number, filters: Filters): boolean {
  const row = catalog.meta[index];
  const price = row[4];
  if (filters.minPriceCents != null && price < filters.minPriceCents) return false;
  if (filters.maxPriceCents != null && price > filters.maxPriceCents) return false;
  if (filters.categories?.length && !filters.categories.includes(catalog.manifest.categories[row[2]])) return false;
  return true;
}

/** Retrieve, score, diversify and explain the next suggestions. */
export function recommend(catalog: Catalog, input: RecommendInput, cfg: Config = defaults): Suggestion[] {
  const count = input.count ?? cfg.feedSize;
  const blocked = new Set<number>(input.exclude ?? []);
  for (const r of input.rated) blocked.add(r.index);
  for (const o of input.owned) if (o.index != null) blocked.add(o.index);
  const allowed = (i: number) => !blocked.has(i) && passesFilters(catalog, i, input.filters);

  const ownedVectors = input.owned.map((o) => o.vector ?? rowVector(catalog, o.index!));
  const ratedVectors = input.rated.map((r) => rowVector(catalog, r.index));

  // Retrieval: top K per signal. Scores enter as one Rocchio query plus the latest high scores.
  const pool = new Set<number>();
  const retrieve = (q: Float32Array) => topK(similarities(catalog, q), cfg.topK, allowed).forEach((i) => pool.add(i));
  // Owned items never seed retrieval: they only feed the near-duplicate check below.
  input.interests.forEach((s) => retrieve(s.vector));
  if (input.rated.length) {
    const rocchio = new Float32Array(catalog.dim);
    input.rated.forEach((r, j) => {
      const w = r.score - 3;
      for (let d = 0; d < catalog.dim; d++) rocchio[d] += w * ratedVectors[j][d];
    });
    if (rocchio.some((x) => x !== 0)) retrieve(rocchio);
    input.rated
      .filter((r) => r.score >= 4)
      .slice(-10)
      .forEach((r) => retrieve(rowVector(catalog, r.index)));
  }
  // Always add well-rated products so a new profile still gets a feed.
  const quality = new Float32Array(catalog.count);
  for (let i = 0; i < catalog.count; i++) quality[i] = bayesQuality(catalog.meta[i][6] / 10, catalog.meta[i][7], cfg);
  topK(quality, cfg.topK, allowed).forEach((i) => pool.add(i));

  const affinity = categoryAffinity(
    input.rated.map((r) => ({ category: catalog.manifest.categories[catalog.meta[r.index][2]], score: r.score })),
    cfg,
  );

  const scored: { index: number; total: number; reason: string }[] = [];
  for (const i of pool) {
    const row = catalog.meta[i];
    const category = catalog.manifest.categories[row[2]];
    const cand: CandidateInput = {
      interests: input.interests.map((s) => ({ sim: dotRow(catalog, i, s.vector), weight: s.weight, label: s.label })),
      rated: input.rated.map((r) => ({ sim: dotRows(catalog, i, r.index), score: r.score, label: r.label })),
      owned: input.owned.map((o, j) => ({ sim: dotRow(catalog, i, ownedVectors[j]), label: o.label, weight: o.weight })),
      rating: row[6] / 10,
      ratingCount: row[7],
      categoryAffinity: affinity.get(category) ?? 0,
    };
    const s = scoreCandidate(cand, cfg);
    if (!s) continue;
    scored.push({
      index: i,
      total: s.total,
      reason: reasonText(s.reason, s.reasonLabel, { category, rating: cand.rating, ratingCount: cand.ratingCount }),
    });
  }
  scored.sort((a, b) => b.total - a.total);
  const head = scored.slice(0, Math.max(count * 6, 100));
  const order = mmr(
    head.map((s) => s.total),
    (a, b) => dotRows(catalog, head[a].index, head[b].index),
    count,
    cfg.mmrLambda,
  );
  return order.map((p) => head[p]);
}
