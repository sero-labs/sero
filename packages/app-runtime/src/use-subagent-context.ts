/**
 * useSubagentContext — fetches the available context (tools + skills) for a
 * workspace's background subagents, without an agent session. Lets app modules
 * (e.g. the Orchestrator loop context override) offer tool/skill toggles.
 *
 * Returns { context, loading, error, refresh }.
 */

import { useState, useEffect, useCallback } from 'react';
import type { AvailableContext } from '@sero-ai/common';
import { getSeroApi } from './sero-bridge';

export interface UseSubagentContextResult {
  context: AvailableContext | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useSubagentContext(workspaceId: string | null): UseSubagentContextResult {
  const [context, setContext] = useState<AvailableContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(() => {
    if (!workspaceId) {
      setContext(null);
      return;
    }
    setLoading(true);
    setError(null);

    const api = getSeroApi();
    if (!api.subagentContext) {
      setError('Subagent context not available in this Sero version');
      setLoading(false);
      return;
    }

    api.subagentContext
      .get(workspaceId)
      .then((result) => {
        setContext(result);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to fetch context');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [workspaceId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { context, loading, error, refresh: fetch };
}
