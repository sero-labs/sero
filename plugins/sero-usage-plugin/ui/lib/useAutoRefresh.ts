/**
 * Staleness-driven refresh shared by the Usage app and the dashboard
 * widget (docs/specs/sero-usage-plugin-spec.md §3.3). Both surfaces may
 * mount together; the extension-side in-flight guard makes the concurrent
 * calls share one scan.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppTools } from '@sero-ai/app-runtime';

import type { UsageState } from '../../shared/types';

const CHECK_EVERY_MS = 60_000;

export interface UsageRefresh {
  /** Manual refresh — always rescans. */
  refresh: () => void;
  refreshing: boolean;
  error: string | null;
}

export function useAutoRefresh(state: UsageState, trackStatus = true): UsageRefresh {
  const { run } = useAppTools();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const inFlightRef = useRef(false);

  const doRefresh = useCallback(
    async (force: boolean) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      if (trackStatus) setRefreshing(true);
      try {
        const result = await run('usage', { action: 'refresh', force });
        if (trackStatus) {
          if (result.isError || result.text.startsWith('Error:')) {
            setError(result.text || 'Refresh failed');
          } else {
            setError(null);
          }
        }
      } catch (err) {
        if (trackStatus) {
          setError(err instanceof Error ? err.message : 'Refresh failed');
        }
      } finally {
        inFlightRef.current = false;
        if (trackStatus) setRefreshing(false);
      }
    },
    [run, trackStatus],
  );

  const refresh = useCallback(() => {
    void doRefresh(true);
  }, [doRefresh]);

  // External side effect (interval timer): check staleness against the
  // latest state once a minute, and once on mount to catch up after Sero
  // was closed. Interval 0 = manual only (still populates an empty state).
  useEffect(() => {
    const check = () => {
      const current = stateRef.current;
      const intervalMinutes = current.settings.refreshIntervalMinutes;
      if (current.lastRefreshedAt === null) {
        void doRefresh(false);
        return;
      }
      if (intervalMinutes <= 0) return;
      if (Date.now() - current.lastRefreshedAt >= intervalMinutes * 60_000) {
        void doRefresh(false);
      }
    };
    check();
    const id = window.setInterval(check, CHECK_EVERY_MS);
    return () => window.clearInterval(id);
  }, [doRefresh]);

  return { refresh, refreshing, error };
}
