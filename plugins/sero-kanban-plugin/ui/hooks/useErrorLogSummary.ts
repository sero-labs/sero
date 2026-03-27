/**
 * useErrorLogSummary — subscribes to the error log file and returns a
 * summary (count + last retrospective timestamp).
 *
 * Uses a Zustand-style external store subscription via useSyncExternalStore
 * instead of useEffect + useState, keeping with the project convention
 * of avoiding useEffect for data subscriptions.
 */

import { useSyncExternalStore } from 'react';
import { getSeroApi } from '@sero-ai/app-runtime';

import { normalizeErrorLog, resolveErrorLogPath, summarizeErrorLog } from '../../shared/error-log';

interface ErrorLogSummary {
  count: number;
  lastRetrospectiveAt?: string;
}

const EMPTY_SUMMARY: ErrorLogSummary = { count: 0 };

/**
 * Per-path external store that manages the appState subscription lifecycle.
 * Each unique stateFilePath gets its own subscription — subscribers share it.
 */
const stores = new Map<string, {
  snapshot: ErrorLogSummary;
  listeners: Set<() => void>;
  unwatch: (() => void) | null;
}>();

function getOrCreateStore(stateFilePath: string) {
  const existing = stores.get(stateFilePath);
  if (existing) return existing;

  const store = {
    snapshot: EMPTY_SUMMARY,
    listeners: new Set<() => void>(),
    unwatch: null as (() => void) | null,
  };
  stores.set(stateFilePath, store);

  // Start watching immediately
  const { appState } = getSeroApi();
  const errorLogPath = resolveErrorLogPath(stateFilePath);

  const handleData = (data: unknown) => {
    store.snapshot = summarizeErrorLog(normalizeErrorLog(data));
    for (const listener of store.listeners) listener();
  };

  const unsubChange = appState.onChange((filePath, data) => {
    if (filePath === errorLogPath) handleData(data);
  });

  appState.watch(errorLogPath)
    .then((data) => handleData(data))
    .catch(() => handleData(null));

  store.unwatch = () => {
    unsubChange();
    void appState.unwatch(errorLogPath);
    stores.delete(stateFilePath);
  };

  return store;
}

function subscribe(stateFilePath: string, onStoreChange: () => void): () => void {
  if (!stateFilePath) return () => {};

  const store = getOrCreateStore(stateFilePath);
  store.listeners.add(onStoreChange);

  return () => {
    store.listeners.delete(onStoreChange);
    // Tear down the appState watcher when all subscribers are gone
    if (store.listeners.size === 0 && store.unwatch) {
      store.unwatch();
    }
  };
}

function getSnapshot(stateFilePath: string): ErrorLogSummary {
  if (!stateFilePath) return EMPTY_SUMMARY;
  return stores.get(stateFilePath)?.snapshot ?? EMPTY_SUMMARY;
}

export function useErrorLogSummary(stateFilePath: string): ErrorLogSummary {
  return useSyncExternalStore(
    (onStoreChange) => subscribe(stateFilePath, onStoreChange),
    () => getSnapshot(stateFilePath),
    () => EMPTY_SUMMARY, // server snapshot
  );
}
