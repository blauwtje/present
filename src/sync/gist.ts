/**
 * Sync the profile through one secret GitHub gist, so every device with the same token sees the same data.
 * The token only ever goes to api.github.com.
 */
export const GIST_FILE = 'cadeau-profiel.json';
const API = 'https://api.github.com';

export interface SyncSettings {
  token: string;
  gistId?: string;
  /** updatedAt of the last version this device pushed or pulled. */
  syncedAt?: number;
}

export class SyncError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

interface GistFile {
  filename: string;
  content?: string;
  raw_url?: string;
  truncated?: boolean;
}

interface Gist {
  id: string;
  files: Record<string, GistFile>;
}

export class GistClient {
  constructor(
    private token: string,
    private fetcher: Fetcher = (u, i) => fetch(u, i),
  ) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetcher(`${API}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      cache: 'no-store',
    });
    if (res.status === 401) throw new SyncError('De GitHub-sleutel werkt niet (meer). Maak een nieuwe.', 401);
    if (res.status === 403 || res.status === 404) throw new SyncError('Deze sleutel mag geen gists lezen of schrijven.', res.status);
    if (!res.ok) throw new SyncError(`GitHub gaf fout ${res.status}.`, res.status);
    return (await res.json()) as T;
  }

  /** Find this app's gist among the user's gists, newest first. */
  async find(): Promise<string | undefined> {
    for (let page = 1; page <= 5; page++) {
      const list = await this.call<Gist[]>(`/gists?per_page=100&page=${page}`);
      const hit = list.find((g) => GIST_FILE in g.files);
      if (hit) return hit.id;
      if (list.length < 100) return undefined;
    }
    return undefined;
  }

  async read(id: string): Promise<string | undefined> {
    const gist = await this.call<Gist>(`/gists/${id}`);
    const file = gist.files[GIST_FILE];
    if (!file) return undefined;
    if (file.truncated && file.raw_url) {
      const res = await this.fetcher(file.raw_url, { headers: { Authorization: `Bearer ${this.token}` } });
      if (!res.ok) throw new SyncError(`GitHub gaf fout ${res.status}.`, res.status);
      return res.text();
    }
    return file.content;
  }

  async create(content: string): Promise<string> {
    const gist = await this.call<Gist>('/gists', {
      method: 'POST',
      body: JSON.stringify({ description: 'Cadeau-app: profiel en scores', public: false, files: { [GIST_FILE]: { content } } }),
    });
    return gist.id;
  }

  async write(id: string, content: string): Promise<void> {
    await this.call<Gist>(`/gists/${id}`, { method: 'PATCH', body: JSON.stringify({ files: { [GIST_FILE]: { content } } }) });
  }
}

export type SyncAction = 'push' | 'pull' | 'merge' | 'none';

/**
 * What to do given this device's last local change, the version it last synced, and the remote version.
 * A device that never synced merges; afterwards the newest side wins.
 */
export function decide(localChangedAt: number, syncedAt: number | undefined, remoteUpdatedAt: number | undefined): SyncAction {
  if (remoteUpdatedAt == null) return 'push';
  if (syncedAt == null) return 'merge';
  const localNew = localChangedAt > syncedAt;
  const remoteNew = remoteUpdatedAt > syncedAt;
  if (localNew && remoteNew) return 'merge';
  if (remoteNew) return 'pull';
  if (localNew) return 'push';
  return 'none';
}
