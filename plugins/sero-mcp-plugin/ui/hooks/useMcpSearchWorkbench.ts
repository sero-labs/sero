import { useAppTools } from '@sero-ai/app-runtime';
import { useCallback, useRef, useState } from 'react';

export interface McpSearchMatch {
  kind: 'tool' | 'resource';
  serverName: string;
  name: string;
  description?: string;
  uri?: string;
  uiResourceUri?: string;
}

export interface McpSearchWorkbenchState {
  query: string;
  serverFilter: string;
  lastQuery: string | null;
  loading: boolean;
  error: string | null;
  results: McpSearchMatch[];
  summaryText: string | null;
  setQuery: (value: string) => void;
  setServerFilter: (value: string) => void;
  search: () => Promise<boolean>;
  clear: () => void;
}

export function useMcpSearchWorkbench(): McpSearchWorkbenchState {
  const { run } = useAppTools();
  const requestIdRef = useRef(0);
  const [query, setQuery] = useState('');
  const [serverFilter, setServerFilter] = useState('all');
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<McpSearchMatch[]>([]);
  const [summaryText, setSummaryText] = useState<string | null>(null);

  const search = useCallback(async () => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      setError('Enter a search query first.');
      setResults([]);
      setSummaryText(null);
      return false;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setLastQuery(normalizedQuery);

    try {
      const result = await run('mcp', {
        action: 'search',
        query: normalizedQuery,
        serverName: serverFilter === 'all' ? undefined : serverFilter,
      });
      if (requestId !== requestIdRef.current) {
        return false;
      }
      const matches = parseMatches(result.details?.matches);
      setResults(matches);
      setSummaryText(result.text);
      if (result.isError) {
        setError(result.text);
        return false;
      }
      return true;
    } catch (cause) {
      if (requestId !== requestIdRef.current) {
        return false;
      }
      const message = cause instanceof Error ? cause.message : String(cause);
      setResults([]);
      setSummaryText(null);
      setError(message);
      return false;
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [query, run, serverFilter]);

  const clear = useCallback(() => {
    requestIdRef.current += 1;
    setQuery('');
    setLastQuery(null);
    setError(null);
    setResults([]);
    setSummaryText(null);
    setServerFilter('all');
    setLoading(false);
  }, []);

  return {
    query,
    serverFilter,
    lastQuery,
    loading,
    error,
    results,
    summaryText,
    setQuery,
    setServerFilter,
    search,
    clear,
  };
}

function parseMatches(value: unknown): McpSearchMatch[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<McpSearchMatch[]>((matches, entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return matches;
    }

    const record = entry as Record<string, unknown>;
    const kind = record.kind === 'resource' ? 'resource' : record.kind === 'tool' ? 'tool' : null;
    const serverName = typeof record.serverName === 'string' ? record.serverName : '';
    const name = typeof record.name === 'string' ? record.name : '';
    if (!kind || !serverName || !name) {
      return matches;
    }

    matches.push({
      kind,
      serverName,
      name,
      description: typeof record.description === 'string' ? record.description : undefined,
      uri: typeof record.uri === 'string' ? record.uri : undefined,
      uiResourceUri: typeof record.uiResourceUri === 'string' ? record.uiResourceUri : undefined,
    });
    return matches;
  }, []);
}

export default useMcpSearchWorkbench;
