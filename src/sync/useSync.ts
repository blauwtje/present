import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProfileData } from '../engine/protocol';
import type { Filters } from '../engine/types';
import type { Store } from '../store/db';
import { mergeProfiles, parseBackup, toBackup, type Backup } from '../store/backup';
import { decide, GistClient, SyncError } from './gist';

export type SyncStatus =
  | { state: 'off' }
  | { state: 'busy'; lastAt?: number }
  | { state: 'ok'; lastAt: number }
  | { state: 'error'; message: string; lastAt?: number };

interface Options {
  store: Store | null;
  profile: ProfileData;
  filters: Filters;
  /** Replace what the app shows with synced data. */
  apply: (data: ProfileData, filters: Filters) => void;
}

const PUSH_DELAY = 2000;

/** Keeps the profile in one secret gist: pull on open and when the app comes back, push after changes. */
export function useSync({ store, profile, filters, apply }: Options) {
  const [status, setStatus] = useState<SyncStatus>({ state: 'off' });
  const latest = useRef({ profile, filters });
  useEffect(() => {
    latest.current = { profile, filters };
  }, [profile, filters]);
  const running = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async () => {
    if (!store) return;
    const settings = await store.getSync();
    if (!settings) return setStatus({ state: 'off' });
    setStatus((s) => ({ state: 'busy', lastAt: 'lastAt' in s ? s.lastAt : undefined }));
    try {
      const client = new GistClient(settings.token);
      const gistId = settings.gistId ?? (await client.find());
      const text = gistId ? await client.read(gistId) : undefined;
      const remote: Backup | undefined = text ? parseBackup(text) : undefined;
      const changedAt = await store.getChangedAt();
      const action = decide(changedAt, settings.syncedAt, remote?.updatedAt);
      const { profile: local, filters: localFilters } = latest.current;

      let pushData: { data: ProfileData; filters: Filters } | null = null;
      let syncedAt = settings.syncedAt ?? 0;
      if (action === 'pull' && remote) {
        await store.replaceAll(remote);
        await store.putChangedAt(remote.updatedAt!);
        apply(remote, remote.filters);
        syncedAt = remote.updatedAt!;
      } else if (action === 'merge' && remote) {
        const merged = mergeProfiles(remote, local);
        await store.replaceAll({ ...merged, filters: localFilters });
        apply(merged, localFilters);
        pushData = { data: merged, filters: localFilters };
      } else if (action === 'push') {
        pushData = { data: local, filters: localFilters };
      }

      let id = gistId;
      if (pushData) {
        const now = Date.now();
        const content = JSON.stringify({ ...toBackup(pushData.data, pushData.filters), updatedAt: now });
        if (id) await client.write(id, content);
        else id = await client.create(content);
        await store.putChangedAt(now);
        syncedAt = now;
      }
      await store.putSync({ ...settings, gistId: id, syncedAt });
      setStatus({ state: 'ok', lastAt: Date.now() });
    } catch (e) {
      const message = e instanceof SyncError ? e.message : 'Synchroniseren lukte niet. Probeer het later opnieuw.';
      setStatus((s) => ({ state: 'error', message, lastAt: 'lastAt' in s ? s.lastAt : undefined }));
    }
  }, [store, apply]);

  /** One sync at a time; a request during a run starts another run after it. */
  const sync = useCallback(() => {
    const next = (running.current ?? Promise.resolve()).then(run);
    running.current = next.finally(() => {
      if (running.current === next) running.current = null;
    });
    return next;
  }, [run]);

  /** Call after every change the user makes on this device. */
  const markChanged = useCallback(() => {
    if (!store) return;
    void store.putChangedAt(Date.now());
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void sync(), PUSH_DELAY);
  }, [store, sync]);

  const connect = useCallback(
    async (token: string) => {
      if (!store) return;
      await store.putSync({ token: token.trim() });
      await sync();
    },
    [store, sync],
  );

  const disconnect = useCallback(async () => {
    await store?.deleteSync();
    setStatus({ state: 'off' });
  }, [store]);

  useEffect(() => {
    if (!store) return;
    void Promise.resolve().then(sync);
    const onVisible = () => document.visibilityState === 'visible' && void sync();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [store, sync]);

  return { status, connect, disconnect, syncNow: sync, markChanged };
}
