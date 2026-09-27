import { describe, expect, it } from 'vitest';
import { loadCatalog, productAt, rowOf } from './catalog';
import type { Manifest, MetaRow } from './types';

function fakeCatalog() {
  const dim = 2;
  const meta: MetaRow[] = [
    ['A', 'Boek', 0, 0, 1299, 'k1', 45, 120],
    ['B', 'Spel', 1, 1, 2500, 'k2', 42, 80],
    ['C', 'Pan', 1, 1, 3999, 'k3', 48, 900],
  ];
  const metaText = JSON.stringify(meta);
  const manifest: Manifest = {
    version: 1,
    model: 'm',
    dim,
    count: 3,
    categories: ['Books', 'Toys_and_Games'],
    paths: ['Books > Fiction', 'Toys > Games'],
    shards: [
      { file: 'vec-00.bin', count: 2, bytes: 4 },
      { file: 'vec-01.bin', count: 1, bytes: 2 },
    ],
    meta: { file: 'meta.json', bytes: metaText.length },
    totalBytes: 0,
    builtAt: '',
  };
  const files: Record<string, BodyInit> = {
    'manifest.json': JSON.stringify(manifest),
    'meta.json': metaText,
    'vec-00.bin': new Int8Array([1, 2, 3, 4]),
    'vec-01.bin': new Int8Array([-5, 6]),
  };
  return (url: string) => {
    const name = url.split('/').pop()!.split('?')[0];
    return Promise.resolve(name in files ? new Response(files[name]) : new Response('', { status: 404 }));
  };
}

describe('loadCatalog', () => {
  it('concatenates shards in order and indexes ids', async () => {
    const seen: [number, number][] = [];
    const cat = await loadCatalog('base', (l, t) => seen.push([l, t]), fakeCatalog());
    expect(cat.count).toBe(3);
    expect([...cat.vectors]).toEqual([1, 2, 3, 4, -5, 6]);
    expect([...rowOf(cat, 2)]).toEqual([-5, 6]);
    expect(cat.byId.get('C')).toBe(2);
    const last = seen[seen.length - 1];
    expect(last[0]).toBe(last[1]);
  });

  it('maps a metadata row to a product', async () => {
    const cat = await loadCatalog('base/', undefined, fakeCatalog());
    const p = productAt(cat, 1);
    expect(p).toMatchObject({ id: 'B', category: 'Toys_and_Games', path: 'Toys > Games', priceCents: 2500, rating: 4.2 });
    expect(p.image).toContain('k2');
  });

  it('fails on a missing file', async () => {
    const fetcher = fakeCatalog();
    await expect(loadCatalog('x', undefined, (u) => (u.includes('vec-01.bin') ? Promise.resolve(new Response('', { status: 404 })) : fetcher(u)))).rejects.toThrow();
  });
});
