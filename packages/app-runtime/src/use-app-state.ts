/**
 * useAppState — file-backed reactive state for Sero apps.
 *
 * 1. Initial read via IPC
 * 2. File watching via main process (fs.watch → IPC push)
 * 3. Writes via IPC (atomic file write → watcher fires → all consumers update)
 */

import { useState, useEffect, useCallback, useContext, useRef } from 'react';
import { AppContext } from './context';
import { getSeroApi } from './sero-bridge';

/**
 * File-backed reactive state hook.
 *
 * @param defaultState — returned while the file is being read (or if missing)
 * @returns [state, updateState] — updateState accepts an updater function
 */
export function useAppState<T>(defaultState: T): [T, (updater: (prev: T) => T) => void] {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppState must be used inside an <AppProvider>');
  }

  const { stateFilePath } = ctx;
  const [state, setState] = useState<T>(defaultState);
  const stateRef = useRef<T>(defaultState);

  // Keep ref in sync for the updater closure
  stateRef.current = state;

  // Initial read + start watching
  useEffect(() => {
    const api = getSeroApi();
    let unsubChange: (() => void) | null = null;

    // Subscribe to file changes from main process
    unsubChange = api.appState.onChange((fp: string, data: unknown) => {
      if (fp === stateFilePath && data != null) {
        const parsed = data as T;
        stateRef.current = parsed;
        setState(parsed);
      }
    });

    // Start watching (also returns current state)
    api.appState.watch(stateFilePath).then((current) => {
      if (current != null) {
        const parsed = current as T;
        stateRef.current = parsed;
        setState(parsed);
      }
    });

    return () => {
      unsubChange?.();
      api.appState.unwatch(stateFilePath);
    };
  }, [stateFilePath]);

  // Write updater
  const updateState = useCallback(
    (updater: (prev: T) => T) => {
      const next = updater(stateRef.current);
      stateRef.current = next;
      setState(next);

      // Persist to disk (async, fire-and-forget — watcher will confirm)
      const api = getSeroApi();
      api.appState.write(stateFilePath, next);
    },
    [stateFilePath],
  );

  return [state, updateState];
}
