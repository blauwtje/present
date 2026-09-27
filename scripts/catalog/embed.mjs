// Embed product files and pack them into the catalog v1 format.
// Usage: node scripts/catalog/embed.mjs embed <cat.jsonl> <cat.bin>
//        node scripts/catalog/embed.mjs pack <dir with jsonl+bin> <out dir> [target]
import { createReadStream, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
export const DTYPE = 'q8';
export const DIM = 384;
export const SHARD_ROWS = 5000;

/** Quantize one L2-normalized float vector into int8 (round(v * 127), clamped). */
export function quantize(vec, out = new Int8Array(vec.length), offset = 0) {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vec.length; i++) {
    const q = Math.round((vec[i] / norm) * 127);
    out[offset + i] = q > 127 ? 127 : q < -127 ? -127 : q;
  }
  return out;
}

/** Build the manifest, metadata rows and shard buffers from products and their int8 vectors. */
export function pack(products, vectors, { dim = DIM, shardRows = SHARD_ROWS, model = MODEL } = {}) {
  if (vectors.length !== products.length * dim) throw new Error('vector length does not match products');
  const categories = [];
  const catIndex = new Map();
  const paths = [];
  const pathIndex = new Map();
  const idx = (map, list, key) => {
    if (!map.has(key)) {
      map.set(key, list.length);
      list.push(key);
    }
    return map.get(key);
  };
  const meta = products.map((p) => [
    p.asin,
    p.title,
    idx(catIndex, categories, p.top_category),
    idx(pathIndex, paths, p.path),
    p.price_cents,
    p.image_key,
    p.rating_x10,
    p.rating_count,
  ]);
  const shards = [];
  for (let start = 0, n = 0; start < products.length; start += shardRows, n++) {
    const count = Math.min(shardRows, products.length - start);
    const data = vectors.subarray(start * dim, (start + count) * dim);
    shards.push({ file: `vec-${String(n).padStart(2, '0')}.bin`, count, data });
  }
  const manifest = {
    version: 1,
    model,
    dim,
    count: products.length,
    categories,
    paths,
    shards: shards.map(({ file, count, data }) => ({ file, count, bytes: data.byteLength })),
    meta: { file: 'meta.json', bytes: 0 },
    totalBytes: 0,
    builtAt: new Date().toISOString(),
  };
  return { manifest, meta, shards };
}

/** Write a packed catalog to disk and fill in the byte counts. */
export function writeCatalog(outDir, { manifest, meta, shards }) {
  mkdirSync(outDir, { recursive: true });
  for (const s of shards) writeFileSync(join(outDir, s.file), Buffer.from(s.data.buffer, s.data.byteOffset, s.data.byteLength));
  const metaText = JSON.stringify(meta);
  writeFileSync(join(outDir, manifest.meta.file), metaText);
  manifest.meta.bytes = Buffer.byteLength(metaText);
  const vecBytes = manifest.shards.reduce((a, s) => a + s.bytes, 0);
  manifest.totalBytes = vecBytes + manifest.meta.bytes;
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest));
  manifest.totalBytes += statSync(join(outDir, 'manifest.json')).size;
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest));
  return manifest;
}

/**
 * Pick `target` products spread evenly over categories. Each list is already sorted best first;
 * a category with too few products hands its unused share to the others. Returns chosen positions.
 */
export function balance(perCategory, target) {
  const cats = [...perCategory.keys()];
  const quota = new Map(cats.map((c) => [c, 0]));
  let left = target;
  let open = cats.filter((c) => perCategory.get(c).length > 0);
  while (left > 0 && open.length) {
    const share = Math.max(1, Math.ceil(left / open.length));
    const next = [];
    for (const c of open) {
      if (left === 0) break;
      const take = Math.min(share, perCategory.get(c).length - quota.get(c), left);
      quota.set(c, quota.get(c) + take);
      left -= take;
      if (quota.get(c) < perCategory.get(c).length) next.push(c);
    }
    open = next;
  }
  return quota;
}

async function readProducts(file) {
  const rows = [];
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) rows.push(JSON.parse(line));
  return rows;
}

/** Embed one category file into `<name>.bin`, one int8 row per product in file order. */
async function embedFile(input, output) {
  const { pipeline } = await import('@huggingface/transformers');
  const products = await readProducts(input);
  console.log(`${input}: ${products.length} products`);
  const extractor = await pipeline('feature-extraction', MODEL, { dtype: DTYPE });
  const vectors = new Int8Array(products.length * DIM);
  const batch = 64;
  const t0 = Date.now();
  for (let i = 0; i < products.length; i += batch) {
    const texts = products.slice(i, i + batch).map((p) => p.text);
    const out = await extractor(texts, { pooling: 'mean', normalize: true });
    const data = out.data;
    for (let j = 0; j < texts.length; j++) quantize(data.subarray(j * DIM, (j + 1) * DIM), vectors, (i + j) * DIM);
    if ((i / batch) % 25 === 0) console.log(`embedded ${i + texts.length}/${products.length} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  writeFileSync(output, Buffer.from(vectors.buffer));
}

/** Merge every `<cat>.jsonl` + `<cat>.bin` in `dir`, balance to `target` and write the catalog. */
async function packDir(dir, outDir, target) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort();
  const perCategory = new Map();
  const seen = new Set();
  for (const f of files) {
    const products = await readProducts(join(dir, f));
    const buf = readFileSync(join(dir, f.replace(/\.jsonl$/, '.bin')));
    const vec = new Int8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    if (vec.length !== products.length * DIM) throw new Error(`${f}: vectors do not match products`);
    const rows = [];
    products.forEach((p, i) => {
      if (seen.has(p.asin)) return;
      seen.add(p.asin);
      rows.push({ p, v: vec.subarray(i * DIM, (i + 1) * DIM) });
    });
    perCategory.set(f.replace(/\.jsonl$/, ''), rows);
  }
  const quota = balance(perCategory, target);
  const chosen = [...perCategory].flatMap(([c, rows]) => rows.slice(0, quota.get(c)));
  console.log('selected per category:', Object.fromEntries(quota));
  const vectors = new Int8Array(chosen.length * DIM);
  chosen.forEach((r, i) => vectors.set(r.v, i * DIM));
  const manifest = writeCatalog(outDir, pack(chosen.map((r) => r.p), vectors));
  console.log(`catalog: ${manifest.count} products, ${manifest.shards.length} shards, ${(manifest.totalBytes / 1e6).toFixed(2)} MB`);
}

async function main() {
  const [cmd, a, b, target = '60000'] = process.argv.slice(2);
  if (cmd === 'embed') await embedFile(a, b);
  else if (cmd === 'pack') await packDir(a, b, Number(target));
  else throw new Error('usage: embed.mjs embed <in.jsonl> <out.bin> | pack <dir> <outDir> [target]');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
