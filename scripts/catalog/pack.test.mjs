import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { quantize, pack, writeCatalog } from './embed.mjs';

const product = (i, cat) => ({
  asin: `A${i}`,
  title: `Item ${i}`,
  top_category: cat,
  path: `${cat} > Sub`,
  price_cents: 1000 + i,
  image_key: `key${i}`,
  rating_x10: 45,
  rating_count: 100 + i,
});

test('quantize normalizes and scales to int8', () => {
  const q = quantize([3, 4, 0]);
  assert.deepEqual([...q], [76, 102, 0]);
});

test('pack splits shards and indexes categories and paths', () => {
  const dim = 4;
  const products = [product(0, 'Books'), product(1, 'Toys'), product(2, 'Books')];
  const vectors = new Int8Array(products.length * dim).map((_, i) => i);
  const { manifest, meta, shards } = pack(products, vectors, { dim, shardRows: 2 });
  assert.equal(manifest.count, 3);
  assert.deepEqual(manifest.categories, ['Books', 'Toys']);
  assert.deepEqual(manifest.paths, ['Books > Sub', 'Toys > Sub']);
  assert.deepEqual(shards.map((s) => s.count), [2, 1]);
  assert.deepEqual([...shards[1].data], [8, 9, 10, 11]);
  assert.deepEqual(meta[2], ['A2', 'Item 2', 0, 0, 1002, 'key2', 45, 102]);
});

test('writeCatalog writes files and measures total bytes', () => {
  const dim = 4;
  const products = [product(0, 'Books'), product(1, 'Toys')];
  const dir = mkdtempSync(join(tmpdir(), 'cat-'));
  const manifest = writeCatalog(dir, pack(products, new Int8Array(8).fill(1), { dim, shardRows: 5 }));
  const onDisk = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  assert.equal(onDisk.totalBytes, manifest.totalBytes);
  assert.equal(readFileSync(join(dir, 'vec-00.bin')).length, 8);
  assert.ok(manifest.totalBytes > 8 + manifest.meta.bytes);
});

test('pack rejects mismatched vectors', () => {
  assert.throws(() => pack([product(0, 'Books')], new Int8Array(3), { dim: 4 }));
});

test('balance spreads the target and hands unused share on', async () => {
  const { balance } = await import('./embed.mjs');
  const q = balance(new Map([['a', Array(10)], ['b', Array(2)], ['c', Array(100)]]), 30);
  assert.deepEqual(Object.fromEntries(q), { a: 10, b: 2, c: 18 });
  const even = balance(new Map([['a', Array(50)], ['b', Array(50)]]), 30);
  assert.deepEqual(Object.fromEntries(even), { a: 15, b: 15 });
});
