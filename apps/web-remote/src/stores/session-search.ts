/**
 * Session search store — the sidebar search box.
 *
 * Two tiers answer one query. Tier 1 filters the sessions already loaded,
 * so the list narrows as you type. Tier 2 asks the gateway to scan message
 * bodies, which takes a round trip, so it waits for a pause in typing.
 */

import { create } from 'zustand';
import { useConnectionStore } from './connection';
import type { GatewayMessage } from '@/lib/gateway-client';

/** Pause in typing before the gateway scan starts. */
export const DEBOUNCE_MS = 300;

/** Shortest query the gateway scan accepts. */
export const MIN_QUERY_LENGTH = 3;

/** One session the gateway scan matched. */
export interface SessionSearchResult {
  sessionId: string;
  workspaceId: string;
  name: string;
  snippet: string;
  matchCount: number;
  updatedAt: string;
}

export type SearchStatus = 'idle' | 'searching' | 'done';

interface SessionSearchStore {
  /** What the search box holds, unchanged. */
  query: string;
  results: SessionSearchResult[];
  status: SearchStatus;
  setQuery: (query: string) => void;
  clear: () => void;
  handleMessage: (msg: GatewayMessage) => void;
}

function getClient() {
  const client = useConnectionStore.getState().client;
  if (!client) throw new Error('Not connected');
  return client;
}

function isResult(value: unknown): value is SessionSearchResult {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.sessionId === 'string' && typeof record.workspaceId === 'string';
}

export const useSessionSearchStore = create<SessionSearchStore>((set, get) => {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const cancelPending = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
  };

  return {
    query: '',
    results: [],
    status: 'idle',

    setQuery: (query: string) => {
      cancelPending();
      set({ query });

      // A short query stays on tier 1. Scanning every session for one or
      // two characters costs a lot and matches nearly everything.
      if (query.trim().length < MIN_QUERY_LENGTH) {
        set({ results: [], status: 'idle' });
        return;
      }

      set({ status: 'searching' });
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        try {
          getClient().searchSessions(get().query.trim());
        } catch {
          // Not connected. Tier 1 still answers from what is loaded.
          set({ status: 'done' });
        }
      }, DEBOUNCE_MS);
    },

    clear: () => {
      cancelPending();
      set({ query: '', results: [], status: 'idle' });
    },

    handleMessage: (msg: GatewayMessage) => {
      if (!('requestType' in msg) || msg.requestType !== 'search_sessions') return;

      if (msg.type === 'error') {
        set({ results: [], status: 'done' });
        return;
      }
      if (msg.type !== 'ok') return;

      const data = (msg as { data?: unknown }).data;
      const results = Array.isArray(data) ? data.filter(isResult) : [];
      set({ results, status: 'done' });
    },
  };
});
