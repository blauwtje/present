/** Catalog format version 1, as written by scripts/catalog/embed.mjs. */
export interface Manifest {
  version: 1;
  model: string;
  dim: number;
  count: number;
  categories: string[];
  paths: string[];
  shards: { file: string; count: number; bytes: number }[];
  meta: { file: string; bytes: number };
  totalBytes: number;
  builtAt: string;
}

/** [asin, title, categoryIndex, pathIndex, priceCents, imageKey, ratingX10, ratingCount] */
export type MetaRow = [string, string, number, number, number, string, number, number];

export interface Catalog {
  manifest: Manifest;
  dim: number;
  count: number;
  /** All product vectors, row-major, `dim` int8 values per product. */
  vectors: Int8Array;
  meta: MetaRow[];
  /** Product index by asin. */
  byId: Map<string, number>;
}

export interface Product {
  index: number;
  id: string;
  title: string;
  category: string;
  path: string;
  priceCents: number;
  image: string;
  rating: number;
  ratingCount: number;
}

export interface Interest {
  id: string;
  text: string;
  /** 1 to 5 */
  weight: number;
}

export interface Owned {
  id: string;
  /** Free text, or the title of the catalog product. */
  text: string;
  /** Catalog product id when picked from the catalog. */
  productId?: string;
  /** How much the user likes it, 1 to 10; missing counts as 7. */
  rating?: number;
}

export interface Rating {
  productId: string;
  /** 1 to 5 */
  score: number;
  at: number;
}

export interface Filters {
  minPriceCents?: number;
  maxPriceCents?: number;
  /** Top category names; empty or missing means all. */
  categories?: string[];
}

/** A profile signal with its vector already computed. */
export interface Signal {
  vector: Float32Array;
  weight: number;
  label: string;
}

export type ReasonKind = 'interest' | 'liked' | 'owned' | 'quality' | 'category';

export interface Suggestion {
  index: number;
  total: number;
  reason: string;
}
