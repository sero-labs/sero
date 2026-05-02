import { useCallback, useEffect, useState } from 'react';
import type { PluginChangeEventIPC, PluginDevSessionIPC } from './host';
import { getSero } from './host';

function sortPluginDevSessions(sessions: PluginDevSessionIPC[]): PluginDevSessionIPC[] {
  return [...sessions].sort((left, right) => {
    const updatedAtDelta = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    if (updatedAtDelta !== 0) return updatedAtDelta;

    const leftLabel = left.name ?? left.appId ?? left.sourcePath;
    const rightLabel = right.name ?? right.appId ?? right.sourcePath;
    return leftLabel.localeCompare(rightLabel);
  });
}

function isDevSessionEvent(event: PluginChangeEventIPC): boolean {
  return event.type === 'changed' && (
    event.reason === 'dev-session-started'
    || event.reason === 'dev-session-refreshed'
    || event.reason === 'dev-session-stopped'
  );
}

export function usePluginDevSessions() {
  const [sessions, setSessions] = useState<PluginDevSessionIPC[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [refreshingIds, setRefreshingIds] = useState<string[]>([]);
  const [stoppingIds, setStoppingIds] = useState<string[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextSessions = await getSero().plugins.listDevSessions();
      setSessions(sortPluginDevSessions(nextSessions));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load local plugin development sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();

    return getSero().plugins.onChanged((event) => {
      if (isDevSessionEvent(event)) {
        void reload();
      }
    });
  }, [reload]);

  const startDevSession = useCallback(async (sourcePath?: string) => {
    setStarting(true);
    setError(null);
    try {
      const created = await getSero().plugins.startDevSession(sourcePath);
      if (!created) {
        return false;
      }
      await reload();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start local plugin development');
      return false;
    } finally {
      setStarting(false);
    }
  }, [reload]);

  const refreshDevSession = useCallback(async (sessionId: string) => {
    setError(null);
    setRefreshingIds((prev) => [...prev, sessionId]);
    try {
      await getSero().plugins.refreshDevSession(sessionId);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh local plugin development session');
    } finally {
      setRefreshingIds((prev) => prev.filter((id) => id !== sessionId));
    }
  }, [reload]);

  const stopDevSession = useCallback(async (sessionId: string) => {
    setError(null);
    setStoppingIds((prev) => [...prev, sessionId]);
    try {
      await getSero().plugins.stopDevSession(sessionId);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop local plugin development session');
    } finally {
      setStoppingIds((prev) => prev.filter((id) => id !== sessionId));
    }
  }, [reload]);

  const revealInFinder = useCallback(async (sourcePath: string) => {
    setError(null);
    try {
      await getSero().shell.showItemInFolder(sourcePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reveal plugin folder');
    }
  }, []);

  return {
    sessions,
    loading,
    error,
    starting,
    refreshingIds,
    stoppingIds,
    reload,
    startDevSession,
    refreshDevSession,
    stopDevSession,
    revealInFinder,
  };
}
