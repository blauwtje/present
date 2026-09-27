import type { Filters, Interest, Owned, Rating } from '../engine/types';
import type { ProfileData } from '../engine/protocol';

export interface Backup extends ProfileData {
  app: 'cadeau';
  version: 1;
  exportedAt: string;
  filters: Filters;
  /** Time of the change this copy holds; set by sync. */
  updatedAt?: number;
}

export function toBackup(data: ProfileData, filters: Filters): Backup {
  return { app: 'cadeau', version: 1, exportedAt: new Date().toISOString(), filters, ...data };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const inRange = (n: unknown) => typeof n === 'number' && n >= 1 && n <= 5;

/** Parse and validate a backup file; throws a Dutch message on bad input. */
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Dit is geen geldig backupbestand.');
  }
  if (!isObj(raw) || raw.app !== 'cadeau' || raw.version !== 1) throw new Error('Dit is geen backup van deze app.');
  const list = (key: string) => (Array.isArray(raw[key]) ? (raw[key] as unknown[]) : []);
  const interests = list('interests').filter(
    (i): i is Interest => isObj(i) && typeof i.id === 'string' && typeof i.text === 'string' && inRange(i.weight),
  );
  const owned = list('owned')
    .filter((o): o is Owned => isObj(o) && typeof o.id === 'string' && typeof o.text === 'string')
    .map((o) => {
      const r = o.rating;
      const { rating: _drop, ...rest } = o;
      void _drop;
      return typeof r === 'number' && r >= 1 && r <= 10 ? { ...rest, rating: Math.round(r) } : rest;
    });
  const ratings = list('ratings').filter(
    (r): r is Rating => isObj(r) && typeof r.productId === 'string' && inRange(r.score) && typeof r.at === 'number',
  );
  const filters = isObj(raw.filters) ? (raw.filters as Filters) : {};
  const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : undefined;
  return { app: 'cadeau', version: 1, exportedAt: String(raw.exportedAt ?? ''), filters, interests, owned, ratings, updatedAt };
}

export function downloadBackup(backup: Backup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cadeau-backup-${backup.exportedAt.slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Union of two profiles; on the same id or product, `add` wins. */
export function mergeProfiles(base: ProfileData, add: ProfileData): ProfileData {
  const merge = <T>(old: T[], extra: T[], key: (x: T) => string) => [...old.filter((x) => !extra.some((a) => key(a) === key(x))), ...extra];
  return {
    interests: merge(base.interests, add.interests, (i) => i.id),
    owned: merge(base.owned, add.owned, (o) => o.id),
    ratings: merge(base.ratings, add.ratings, (r) => r.productId).sort((x, y) => x.at - y.at),
  };
}
