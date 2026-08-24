/**
 * useAppState — file-backed reactive state for Sero apps.
 *
 * 1. Initial read via IPC
 * 2. File watching via main process (fs.watch → IPC push)
 * 3. Writes via IPC (atomic file write → watcher fires → all consumers update)
 */

import { useState, useEffect, useCallback, use, useRef } from 'react';
import { AppContext } from './context';
import { getSeroApi, type AppStateWriteResult, type SeroWindowAppStateBridge } from './sero-bridge';

/**
 * File-backed reactive state hook.
 *
 * @param defaultState — returned while the file is being read (or if missing)
 * @returns [state, updateState, ready]
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The state file is merged over the app's default state key by key, and the
 * default wins wherever the two disagree in type — a malformed file cannot
 * hand an app a number where it expects a string.
 *
 * An `undefined` default is the exception: it says the field is optional, not
 * that it must be absent. Enforcing it would drop the file's value on every
 * read, which is exactly what used to happen to any optional field an app
 * declared as `undefined` in its default state.
 */
function normalizeStateValue(defaultValue: unknown, currentValue: unknown): unknown {
  if (defaultValue === undefined) return currentValue;

  if (Array.isArray(defaultValue)) {
    return Array.isArray(currentValue) ? currentValue : defaultValue;
  }

  if (isPlainObject(defaultValue)) {
    if (!isPlainObject(currentValue)) return defaultValue;
    const merged: Record<string, unknown> = { ...currentValue };
    for (const [key, childDefault] of Object.entries(defaultValue)) {
      merged[key] = normalizeStateValue(childDefault, currentValue[key]);
    }
    return merged;
  }

  if (currentValue === undefined) return defaultValue;
  if (defaultValue === null) return currentValue ?? null;
  return typeof currentValue === typeof defaultValue ? currentValue : defaultValue;
}

/**
 * Merge a state file's contents over an app's default state. Exported for its
 * tests, not from the package entry point — it is not public API.
 */
export function applyDefaultState<T>(defaultState: T, current: unknown): T {
  return normalizeStateValue(defaultState, current) as T;
}

/** How often a rejected write is re-applied before the update is dropped. */
const MAX_WRITE_ATTEMPTS = 5;

/**
 * Write state, re-applying the updater on top of newer file content whenever
 * the host rejects the etag. The caller's change lands on top of what another
 * writer (extension, runtime) wrote instead of replacing it.
 *
 * Returns the state that reached disk, or `null` when the file kept changing
 * for `MAX_WRITE_ATTEMPTS` rounds. Assumes the updater is a pure function of
 * `prev` — an updater closing over values derived from an earlier `prev`
 * re-applies those stale values.
 *
 * Exported for its tests, not from the package entry point.
 */
export async function writeStateWithRebase<T>(
  write: (data: T, expectedEtag: string | null) => Promise<AppStateWriteResult>,
  updater: (prev: T) => T,
  first: { state: T; etag: string | null },
  rebase: (fileData: unknown) => T,
): Promise<{ state: T; etag: string | null } | null> {
  let candidate = first.state;
  let etag = first.etag;

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const result = await write(candidate, etag);
    if (result.ok) return { state: candidate, etag: result.etag };

    const base = rebase(result.data);
    etag = result.etag;
    candidate = updater(base);
    // The newer content already satisfies the update — nothing left to write.
    if (Object.is(candidate, base)) return { state: base, etag };
  }
  return null;
}

export function useAppState<T>(defaultState: T): [T, (updater: (prev: T) => T) => void, boolean] {
  const ctx = use(AppContext);
  if (!ctx) {
    throw new Error('useAppState must be used inside an <AppProvider>');
  }

  const { stateFilePath } = ctx;
  const [snapshot, setSnapshot] = useState<{ filePath: string; value: T }>({
    filePath: stateFilePath,
    value: defaultState,
  });
  const state = snapshot.filePath === stateFilePath ? snapshot.value : defaultState;
  const [readyPath, setReadyPath] = useState<string | null>(null);
  const defaultStateRef = useRef<T>(defaultState);
  const stateRef = useRef<T>(defaultState);
  const latestWriteIdRef = useRef(0);
  /** Etag of the last file content this hook observed; `null` before the
   * first watch result, which makes any earlier write rebase onto disk. */
  const etagRef = useRef<string | null>(null);

  defaultStateRef.current = defaultState;
  stateRef.current = state;

  const applyState = useCallback((nextState: T) => {
    stateRef.current = nextState;
    setSnapshot({ filePath: stateFilePath, value: nextState });
  }, [stateFilePath]);

  const recoverFromWriteFailure = useCallback(
    async (api: SeroWindowAppStateBridge, writeId: number, fallbackState: T) => {
      if (writeId !== latestWriteIdRef.current) return;

      try {
        const current = await api.read<T | null>(stateFilePath);
        if (writeId !== latestWriteIdRef.current) return;
        applyState(current == null ? fallbackState : applyDefaultState(fallbackState, current));
      } catch {
        if (writeId !== latestWriteIdRef.current) return;
        applyState(fallbackState);
      }
    },
    [applyState, stateFilePath],
  );

  useEffect(() => {
    const api = getSeroApi();
    let isActive = true;

    const applyIfActive = (nextState: T) => {
      if (!isActive) return;
      applyState(nextState);
    };

    const unsubscribe = api.appState.onChange<T | null>((filePath, data, etag) => {
      if (!isActive || filePath !== stateFilePath) return;
      etagRef.current = etag;
      if (data == null) return;
      applyIfActive(applyDefaultState(defaultStateRef.current, data));
    });

    void api.appState.watch<T | null>(stateFilePath).then(
      ({ data, etag }) => {
        if (isActive) etagRef.current = etag;
        if (data != null) {
          applyIfActive(applyDefaultState(defaultStateRef.current, data));
        }
        if (isActive) setReadyPath(stateFilePath);
      },
      () => {
        if (isActive) setReadyPath(stateFilePath);
      },
    );

    return () => {
      isActive = false;
      unsubscribe();
      void api.appState.unwatch(stateFilePath);
    };
  }, [applyState, stateFilePath]);

  const updateState = useCallback(
    (updater: (prev: T) => T) => {
      const previous = stateRef.current;
      const next = updater(previous);
      if (Object.is(next, previous)) return;
      const writeId = latestWriteIdRef.current + 1;
      latestWriteIdRef.current = writeId;
      applyState(next);

      const api = getSeroApi();
      void writeStateWithRebase(
        (data, expectedEtag) => api.appState.write(stateFilePath, data, expectedEtag),
        updater,
        { state: next, etag: etagRef.current },
        (fileData) => applyDefaultState(defaultStateRef.current, fileData),
      ).then((result) => {
        if (result === null) {
          console.error(`[app-runtime] Dropped app state update for ${stateFilePath}: the file kept changing under this writer`);
          void recoverFromWriteFailure(api.appState, writeId, previous);
          return;
        }
        etagRef.current = result.etag;
        // A rebase produced a different state than the optimistic one — show
        // what actually reached disk, unless a newer update superseded this.
        if (writeId === latestWriteIdRef.current && !Object.is(result.state, next)) {
          applyState(result.state);
        }
      }, (error: unknown) => {
        if (writeId !== latestWriteIdRef.current) return;
        console.warn(`[app-runtime] Failed to persist app state for ${stateFilePath}`, error);
        void recoverFromWriteFailure(api.appState, writeId, previous);
      });
    },
    [applyState, recoverFromWriteFailure, stateFilePath],
  );

  return [state, updateState, readyPath === stateFilePath];
}
