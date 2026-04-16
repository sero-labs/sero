/**
 * useAppState — file-backed reactive state for Sero apps.
 *
 * 1. Initial read via IPC
 * 2. File watching via main process (fs.watch → IPC push)
 * 3. Writes via IPC (atomic file write → watcher fires → all consumers update)
 */

import { useState, useEffect, useCallback, useContext, useRef } from 'react';
import { AppContext } from './context';
import { getSeroApi, type SeroWindowAppStateBridge } from './sero-bridge';

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
  const defaultStateRef = useRef<T>(defaultState);
  const stateRef = useRef<T>(defaultState);
  const latestWriteIdRef = useRef(0);

  defaultStateRef.current = defaultState;
  stateRef.current = state;

  const applyState = useCallback((nextState: T) => {
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const recoverFromWriteFailure = useCallback(
    async (api: SeroWindowAppStateBridge, writeId: number, fallbackState: T) => {
      if (writeId !== latestWriteIdRef.current) return;

      try {
        const current = await api.read<T | null>(stateFilePath);
        if (writeId !== latestWriteIdRef.current) return;
        applyState(current ?? fallbackState);
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

    applyState(defaultStateRef.current);

    const unsubscribe = api.appState.onChange<T | null>((filePath, data) => {
      if (filePath !== stateFilePath || data == null) return;
      applyIfActive(data);
    });

    void api.appState.watch<T | null>(stateFilePath).then((current) => {
      if (current == null) return;
      applyIfActive(current);
    });

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
      const writeId = latestWriteIdRef.current + 1;
      latestWriteIdRef.current = writeId;
      applyState(next);

      const api = getSeroApi();
      void api.appState.write(stateFilePath, next).catch((error: unknown) => {
        if (writeId !== latestWriteIdRef.current) return;
        console.warn(`[app-runtime] Failed to persist app state for ${stateFilePath}`, error);
        void recoverFromWriteFailure(api.appState, writeId, previous);
      });
    },
    [applyState, recoverFromWriteFailure, stateFilePath],
  );

  return [state, updateState];
}
