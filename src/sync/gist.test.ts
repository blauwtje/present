import { describe, expect, it } from 'vitest';
import { decide, GIST_FILE, GistClient, SyncError } from './gist';

describe('decide', () => {
  it('pushes when nothing is remote yet', () => {
    expect(decide(5, undefined, undefined)).toBe('push');
  });
  it('merges on a device that never synced', () => {
    expect(decide(5, undefined, 3)).toBe('merge');
  });
  it('pulls newer remote data, pushes newer local data', () => {
    expect(decide(10, 10, 20)).toBe('pull');
    expect(decide(30, 20, 20)).toBe('push');
    expect(decide(20, 20, 20)).toBe('none');
  });
  it('merges when both sides changed', () => {
    expect(decide(30, 20, 25)).toBe('merge');
  });
});

function fakeGitHub() {
  const gists = new Map<string, Record<string, { filename: string; content: string }>>();
  gists.set('other', { 'notes.md': { filename: 'notes.md', content: 'x' } });
  const calls: string[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    const auth = (init?.headers as Record<string, string>)?.Authorization;
    if (auth !== 'Bearer good') return new Response('', { status: 401 });
    const path = url.replace('https://api.github.com', '');
    if (path.startsWith('/gists?')) return Response.json([...gists].map(([id, files]) => ({ id, files })));
    if (path === '/gists' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      gists.set('new', { [GIST_FILE]: { filename: GIST_FILE, content: body.files[GIST_FILE].content } });
      return Response.json({ id: 'new', files: gists.get('new') });
    }
    const id = path.split('/')[2];
    if (init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body));
      gists.set(id, { [GIST_FILE]: { filename: GIST_FILE, content: body.files[GIST_FILE].content } });
    }
    return gists.has(id) ? Response.json({ id, files: gists.get(id) }) : new Response('', { status: 404 });
  };
  return { fetcher, calls };
}

describe('GistClient', () => {
  it('creates, finds, writes and reads the app gist', async () => {
    const { fetcher, calls } = fakeGitHub();
    const c = new GistClient('good', fetcher);
    expect(await c.find()).toBeUndefined();
    const id = await c.create('{"a":1}');
    expect(await c.find()).toBe(id);
    await c.write(id, '{"a":2}');
    expect(await c.read(id)).toBe('{"a":2}');
    expect(calls.every((u) => u.includes('https://api.github.com/'))).toBe(true);
  });

  it('reports a bad token', async () => {
    const { fetcher } = fakeGitHub();
    await expect(new GistClient('bad', fetcher).find()).rejects.toBeInstanceOf(SyncError);
  });
});
