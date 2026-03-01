/**
 * useAvailableModels — fetches the list of available models from the
 * Sero host's ModelRegistry. Session-independent: apps don't need an
 * active agent session to enumerate models.
 *
 * Returns { groups, loading, error, refresh }.
 */

import { useState, useEffect, useCallback } from 'react';
import { getSeroApi, type AppModelGroup } from './sero-bridge';

export interface UseAvailableModelsResult {
  /** Model groups, grouped by provider. */
  groups: AppModelGroup[];
  /** True while the initial fetch is in flight. */
  loading: boolean;
  /** Error message if the fetch failed. */
  error: string | null;
  /** Manually re-fetch the list (e.g. after adding auth). */
  refresh: () => void;
}

export function useAvailableModels(): UseAvailableModelsResult {
  const [groups, setGroups] = useState<AppModelGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(() => {
    setLoading(true);
    setError(null);

    const api = getSeroApi();
    if (!api.models) {
      setError('Model listing not available in this Sero version');
      setLoading(false);
      return;
    }

    api.models
      .list()
      .then((result) => {
        setGroups(result);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to fetch models');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { groups, loading, error, refresh: fetch };
}
