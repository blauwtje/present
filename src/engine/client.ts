import type { Product, Filters } from './types';
import type { ProfileData, Request, Response, SuggestedProduct } from './protocol';

export type Status =
  | { state: 'loading'; stage: 'catalog' | 'model'; loaded: number; total: number }
  | { state: 'ready'; count: number; categories: string[]; model?: { loaded: number; total: number } }
  | { state: 'error'; message: string };

type Pending = { resolve: (items: never[]) => void; reject: (e: Error) => void };
type Distribute<T> = T extends unknown ? Omit<T, 'id'> : never;

/** Talks to the recommender worker; every request returns a promise. */
export class EngineClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private listeners = new Set<(s: Status) => void>();
  status: Status = { state: 'loading', stage: 'catalog', loaded: 0, total: 0 };

  constructor(catalogUrl: string) {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<Response>) => this.onMessage(e.data);
    this.worker.onerror = (e) => this.setStatus({ state: 'error', message: e.message || 'Fout in de rekenmodule' });
    this.send({ type: 'init', catalogUrl });
  }

  subscribe(fn: (s: Status) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  recommend(profile: ProfileData, filters: Filters, exclude: string[], count?: number): Promise<SuggestedProduct[]> {
    return this.request({ type: 'recommend', profile, filters, exclude, count });
  }

  search(query: string): Promise<Product[]> {
    return this.request({ type: 'search', query });
  }

  products(ids: string[]): Promise<Product[]> {
    return this.request({ type: 'products', ids });
  }

  private request<T>(msg: Distribute<Exclude<Request, { type: 'init' }>>): Promise<T[]> {
    const id = this.nextId++;
    return new Promise<T[]>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (items: never[]) => void, reject });
      this.send({ ...msg, id } as Request);
    });
  }

  private send(msg: Request) {
    this.worker.postMessage(msg);
  }

  private setStatus(s: Status) {
    this.status = s;
    this.listeners.forEach((fn) => fn(s));
  }

  private onMessage(msg: Response) {
    switch (msg.type) {
      case 'progress':
        if (this.status.state === 'ready') {
          if (msg.stage === 'model') this.setStatus({ ...this.status, model: { loaded: msg.loaded, total: msg.total } });
        } else {
          this.setStatus({ state: 'loading', stage: msg.stage, loaded: msg.loaded, total: msg.total });
        }
        return;
      case 'ready':
        this.setStatus({ state: 'ready', count: msg.count, categories: msg.categories });
        return;
      case 'error': {
        const p = msg.id != null ? this.pending.get(msg.id) : undefined;
        if (p) {
          this.pending.delete(msg.id!);
          p.reject(new Error(msg.message));
        } else if (this.status.state !== 'ready') {
          this.setStatus({ state: 'error', message: msg.message });
        }
        return;
      }
      default: {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        p.resolve(msg.items as never[]);
      }
    }
  }
}
