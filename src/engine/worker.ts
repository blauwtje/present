/// <reference lib="webworker" />
import { env, pipeline, type FeatureExtractionPipeline, type ProgressInfo } from '@huggingface/transformers';
import { loadCatalog, productAt } from './catalog';
import { recommend, similarities, topK } from './recommend';
import type { Request, Response } from './protocol';
import type { Catalog } from './types';

const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

env.allowLocalModels = false;
env.useBrowserCache = true;

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (msg: Response) => scope.postMessage(msg);

let catalog: Catalog | null = null;
let extractor: Promise<FeatureExtractionPipeline> | null = null;
const cache = new Map<string, Float32Array>();

function model(): Promise<FeatureExtractionPipeline> {
  extractor ??= pipeline('feature-extraction', MODEL, {
    dtype: 'q8',
    progress_callback: (p: ProgressInfo) => {
      if (p.status === 'progress_total') post({ type: 'progress', stage: 'model', loaded: p.loaded, total: p.total });
    },
  }) as Promise<FeatureExtractionPipeline>;
  return extractor;
}

async function embed(texts: string[]): Promise<Float32Array[]> {
  const missing = [...new Set(texts.filter((t) => !cache.has(t)))];
  if (missing.length) {
    const fe = await model();
    const out = await fe(missing, { pooling: 'mean', normalize: true });
    const dim = out.dims[out.dims.length - 1];
    const data = out.data as Float32Array;
    missing.forEach((t, i) => cache.set(t, data.slice(i * dim, (i + 1) * dim)));
  }
  return texts.map((t) => cache.get(t)!);
}

function ready(): Catalog {
  if (!catalog) throw new Error('catalogus nog niet geladen');
  return catalog;
}

async function handle(msg: Request) {
  switch (msg.type) {
    case 'init': {
      catalog = await loadCatalog(msg.catalogUrl, (loaded, total) => post({ type: 'progress', stage: 'catalog', loaded, total }));
      post({ type: 'ready', count: catalog.count, categories: catalog.manifest.categories });
      // Start the model download in the background so the first query is fast.
      model().catch((e) => post({ type: 'error', message: String(e) }));
      return;
    }
    case 'recommend': {
      const cat = ready();
      const { interests, owned, ratings } = msg.profile;
      const needText = [...interests.map((i) => i.text), ...owned.filter((o) => !o.productId || !cat.byId.has(o.productId)).map((o) => o.text)];
      const vectors = needText.length ? await embed(needText) : [];
      const vecOf = new Map(needText.map((t, i) => [t, vectors[i]]));
      const rated = ratings
        .filter((r) => cat.byId.has(r.productId))
        .map((r) => {
          const index = cat.byId.get(r.productId)!;
          return { index, score: r.score, label: cat.meta[index][1] };
        });
      const ownedSignals = owned.map((o) => {
        const index = o.productId ? cat.byId.get(o.productId) : undefined;
        const weight = (o.rating ?? 7) / 10;
        return index != null ? { index, label: o.text, weight } : { vector: vecOf.get(o.text)!, label: o.text, weight };
      });
      const exclude = new Set(msg.exclude.map((id) => cat.byId.get(id)).filter((i): i is number => i != null));
      const out = recommend(cat, {
        interests: interests.map((i) => ({ vector: vecOf.get(i.text)!, weight: i.weight, label: i.text })),
        rated,
        owned: ownedSignals,
        filters: msg.filters,
        exclude,
        count: msg.count,
      });
      post({ type: 'recommend', id: msg.id, items: out.map((s) => ({ ...productAt(cat, s.index), reason: s.reason })) });
      return;
    }
    case 'search': {
      const cat = ready();
      const [q] = await embed([msg.query]);
      const idx = topK(similarities(cat, q), 8, () => true);
      post({ type: 'search', id: msg.id, items: idx.map((i) => productAt(cat, i)) });
      return;
    }
    case 'products': {
      const cat = ready();
      const items = msg.ids.map((id) => cat.byId.get(id)).filter((i): i is number => i != null).map((i) => productAt(cat, i));
      post({ type: 'products', id: msg.id, items });
      return;
    }
  }
}

scope.onmessage = (e: MessageEvent<Request>) => {
  const msg = e.data;
  handle(msg).catch((err: unknown) =>
    post({ type: 'error', id: 'id' in msg ? msg.id : undefined, message: err instanceof Error ? err.message : String(err) }),
  );
};
