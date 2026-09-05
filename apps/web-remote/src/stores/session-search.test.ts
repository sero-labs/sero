import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useConnectionStore } from '@/stores/connection';
import {
  DEBOUNCE_MS,
  MIN_QUERY_LENGTH,
  useSessionSearchStore,
} from '@/stores/session-search';
import type { GatewayMessage } from '@/lib/gateway-client';

const searchSessions = vi.fn((_query: string, _limit?: number) => {});

/** Put a client on the connection store that records what was searched. */
function connect(): void {
  useConnectionStore.setState({
    client: { searchSessions } as unknown as never,
  });
}

/** Drop the client, as a disconnected page has. */
function disconnect(): void {
  useConnectionStore.setState({ client: null as unknown as never });
}

function okResponse(data: unknown): GatewayMessage {
  return { type: 'ok', requestType: 'search_sessions', data } as GatewayMessage;
}

const result = {
  sessionId: 's1',
  workspaceId: 'ws-1',
  name: 'Fix the gateway',
  snippet: '…mentions the gateway…',
  matchCount: 2,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('session search store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchSessions.mockClear();
    connect();
    useSessionSearchStore.setState({ query: '', results: [], status: 'idle' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a short query on tier 1 and asks the gateway nothing', () => {
    useSessionSearchStore.getState().setQuery('ga');
    vi.advanceTimersByTime(DEBOUNCE_MS * 2);

    expect(searchSessions).not.toHaveBeenCalled();
    expect(useSessionSearchStore.getState().status).toBe('idle');
  });

  it('searches the gateway after the typing pause', () => {
    useSessionSearchStore.getState().setQuery('gateway');

    expect(searchSessions).not.toHaveBeenCalled();
    expect(useSessionSearchStore.getState().status).toBe('searching');

    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(searchSessions).toHaveBeenCalledWith('gateway');
  });

  it('sends one search for a burst of keystrokes', () => {
    const { setQuery } = useSessionSearchStore.getState();
    setQuery('gat');
    vi.advanceTimersByTime(DEBOUNCE_MS - 50);
    setQuery('gate');
    vi.advanceTimersByTime(DEBOUNCE_MS - 50);
    setQuery('gateway');
    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(searchSessions).toHaveBeenCalledTimes(1);
    expect(searchSessions).toHaveBeenCalledWith('gateway');
  });

  it('trims the query it sends', () => {
    useSessionSearchStore.getState().setQuery('  gateway  ');
    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(searchSessions).toHaveBeenCalledWith('gateway');
    expect(useSessionSearchStore.getState().query).toBe('  gateway  ');
  });

  it('drops pending results when the query falls under the minimum', () => {
    useSessionSearchStore.setState({ results: [result], status: 'done' });

    useSessionSearchStore.getState().setQuery('g'.repeat(MIN_QUERY_LENGTH - 1));

    expect(useSessionSearchStore.getState().results).toEqual([]);
    expect(useSessionSearchStore.getState().status).toBe('idle');
  });

  it('stores the results the gateway returns', () => {
    useSessionSearchStore.getState().handleMessage(okResponse([result]));

    expect(useSessionSearchStore.getState().results).toEqual([result]);
    expect(useSessionSearchStore.getState().status).toBe('done');
  });

  it('ignores entries that are not search results', () => {
    useSessionSearchStore.getState().handleMessage(okResponse([result, { nope: true }, null]));

    expect(useSessionSearchStore.getState().results).toEqual([result]);
  });

  it('ignores a response to another request', () => {
    useSessionSearchStore.setState({ results: [result], status: 'done' });

    useSessionSearchStore.getState().handleMessage({
      type: 'ok',
      requestType: 'list_sessions',
      data: [],
    } as GatewayMessage);

    expect(useSessionSearchStore.getState().results).toEqual([result]);
  });

  it('clears the results when the search fails', () => {
    useSessionSearchStore.setState({ results: [result], status: 'searching' });

    useSessionSearchStore.getState().handleMessage({
      type: 'error',
      requestType: 'search_sessions',
      message: 'Search failed',
    } as GatewayMessage);

    expect(useSessionSearchStore.getState().results).toEqual([]);
    expect(useSessionSearchStore.getState().status).toBe('done');
  });

  it('stops searching when the page is not connected', () => {
    disconnect();

    useSessionSearchStore.getState().setQuery('gateway');
    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(useSessionSearchStore.getState().status).toBe('done');
  });

  it('clear cancels a scheduled search', () => {
    useSessionSearchStore.getState().setQuery('gateway');
    useSessionSearchStore.getState().clear();
    vi.advanceTimersByTime(DEBOUNCE_MS * 2);

    expect(searchSessions).not.toHaveBeenCalled();
    expect(useSessionSearchStore.getState().query).toBe('');
  });
});
