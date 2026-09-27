import type { Catalog, Manifest, MetaRow, Product } from './types';

export type Progress = (loaded: number, total: number) => void;
type Fetcher = (url: string) => Promise<Response>;

const IMAGE_BASE = 'https://m.media-amazon.com/images/I/';

async function readBody(res: Response, onChunk: (n: number) => void): Promise<Uint8Array> {
  if (!res.ok) throw new Error(`${res.url}: HTTP ${res.status}`);
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    onChunk(buf.byteLength);
    return buf;
  }
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    size += value.byteLength;
    onChunk(value.byteLength);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}

/** Load manifest, metadata and every vector shard from `base`, reporting bytes loaded. */
export async function loadCatalog(base: string, onProgress?: Progress, fetcher: Fetcher = fetch): Promise<Catalog> {
  const root = base.endsWith('/') ? base : `${base}/`;
  const manifestRes = await fetcher(`${root}manifest.json`);
  if (!manifestRes.ok) throw new Error(`manifest: HTTP ${manifestRes.status}`);
  const manifest = (await manifestRes.json()) as Manifest;
  if (manifest.version !== 1) throw new Error(`unknown catalog version ${manifest.version}`);
  const total = manifest.meta.bytes + manifest.shards.reduce((a, s) => a + s.bytes, 0);
  let loaded = 0;
  const tick = (n: number) => {
    loaded += n;
    onProgress?.(Math.min(loaded, total), total);
  };
  onProgress?.(0, total);

  const vectors = new Int8Array(manifest.count * manifest.dim);
  const offsets: number[] = [];
  let rows = 0;
  for (const s of manifest.shards) {
    offsets.push(rows * manifest.dim);
    rows += s.count;
  }
  if (rows !== manifest.count) throw new Error('shard counts do not add up');

  const [metaBytes] = await Promise.all([
    fetcher(`${root}${manifest.meta.file}`).then((r) => readBody(r, tick)),
    ...manifest.shards.map((s, i) =>
      fetcher(`${root}${s.file}`)
        .then((r) => readBody(r, tick))
        .then((bytes) => {
          if (bytes.byteLength !== s.count * manifest.dim) throw new Error(`${s.file}: wrong size`);
          vectors.set(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), offsets[i]);
          return bytes;
        }),
    ),
  ]);
  const meta = JSON.parse(new TextDecoder().decode(metaBytes)) as MetaRow[];
  if (meta.length !== manifest.count) throw new Error('metadata count does not match manifest');
  const byId = new Map<string, number>();
  meta.forEach((row, i) => byId.set(row[0], i));
  return { manifest, dim: manifest.dim, count: manifest.count, vectors, meta, byId };
}

export function imageUrl(key: string, size = 400): string {
  return `${IMAGE_BASE}${key}._AC_SL${size}_.jpg`;
}

export function productAt(catalog: Catalog, index: number): Product {
  const [id, title, cat, path, priceCents, key, ratingX10, ratingCount] = catalog.meta[index];
  return {
    index,
    id,
    title,
    category: catalog.manifest.categories[cat],
    path: catalog.manifest.paths[path],
    priceCents,
    image: imageUrl(key),
    rating: ratingX10 / 10,
    ratingCount,
  };
}

/** One product vector as a view into the shared buffer. */
export function rowOf(catalog: Catalog, index: number): Int8Array {
  return catalog.vectors.subarray(index * catalog.dim, (index + 1) * catalog.dim);
}
