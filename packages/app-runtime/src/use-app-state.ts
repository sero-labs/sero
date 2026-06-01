/**
 * useAppState — file-backed reactive state for Sero apps.
 *
 * 1. Initial read via IPC
 * 2. File watching via main process (fs.watch → IPC push)
 * 3. Writes via IPC (atomic file write → watcher fires → all consumers update)
 */

import { useState, useEffect, useCallback, use, useRef } from 'react';
import { AppContext } from './context';
import { getSeroApi, type SeroWindowAppStateBridge } from './sero-bridge';

/**
 * File-backed reactive state hook.
 *
 * @param defaultState — returned while the file is being read (or if missing)
 * @returns [state, updateState] — updateState accepts an updater function
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStateValue(defaultValue: unknown, currentValue: unknown): unknown {
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

function applyDefaultState<T>(defaultState: T, current: unknown): T {
  return normalizeStateValue(defaultState, current) as T;
}

export function useAppState<T>(defaultState: T): [T, (updater: (prev: T) => T) => void] {
  const ctx = use(AppContext);
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

    applyState(defaultStateRef.current);

    const unsubscribe = api.appState.onChange<T | null>((filePath, data) => {
      if (filePath !== stateFilePath || data == null) return;
      applyIfActive(applyDefaultState(defaultStateRef.current, data));
    });

    void api.appState.watch<T | null>(stateFilePath).then((current) => {
      if (current == null) return;
      applyIfActive(applyDefaultState(defaultStateRef.current, current));
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
