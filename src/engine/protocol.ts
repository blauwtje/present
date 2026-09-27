import type { Filters, Interest, Owned, Product, Rating } from './types';

export interface ProfileData {
  interests: Interest[];
  owned: Owned[];
  ratings: Rating[];
}

export type SuggestedProduct = Product & { reason: string };

export type Request =
  | { type: 'init'; catalogUrl: string }
  | { type: 'recommend'; id: number; profile: ProfileData; filters: Filters; exclude: string[]; count?: number }
  | { type: 'search'; id: number; query: string }
  | { type: 'products'; id: number; ids: string[] };

export type Response =
  | { type: 'progress'; stage: 'catalog' | 'model'; loaded: number; total: number }
  | { type: 'ready'; count: number; categories: string[] }
  | { type: 'recommend'; id: number; items: SuggestedProduct[] }
  | { type: 'search'; id: number; items: Product[] }
  | { type: 'products'; id: number; items: Product[] }
  | { type: 'error'; id?: number; message: string };
