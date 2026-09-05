// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentStore } from './agent';
import { handleAgentStreamEvent } from './agent-utils';
import type { ChatHistoryPage, ChatMessage } from '@/types/ipc';

vi.mock('@/stores/container', () => ({
  useContainerStore: { getState: () => ({ setStarting: vi.fn(), setRunning: vi.fn(), setError: vi.fn() }) },
}));
vi.mock('@/stores/sessions', () => ({
  useSessionStore: { getState: () => ({ updateSessionName: vi.fn() }) },
}));

const initialState = useAgentStore.getState();
const loadOlderTurns = vi.fn<(sessionId: string, cursor: string) => Promise<ChatHistoryPage>>();

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

const msg = (id: string): ChatMessage => ({ type: 'user', id, text: id });

function seed(messages: ChatMessage[], olderCursor: string | null) {
  useAgentStore.setState({
    agents: {
      'session-1': {
        sessionId: 'session-1',
        sessionPath: '/tmp/session-1.jsonl',
        workspaceId: 'ws-1',
        messages,
        olderCursor,
        loadingOlderTurns: false,
        isStreaming: false,
        retry: null,
        error: null,
        commands: [],
        modelState: null,
      },
    },
  });
}

beforeEach(() => {
  loadOlderTurns.mockReset();
  (window as unknown as { sero: unknown }).sero = { agent: { loadOlderTurns } };
});

afterEach(() => {
  useAgentStore.setState(initialState, true);
});

describe('loadOlderTurns', () => {
  it('prepends the older window and advances the cursor', async () => {
    seed([msg('u10'), msg('u11')], '10@40');
    loadOlderTurns.mockResolvedValue({ messages: [msg('u8'), msg('u9')], olderCursor: '8@32' });

    await useAgentStore.getState().loadOlderTurns('session-1');

    const agent = useAgentStore.getState().agents['session-1'];
    expect(loadOlderTurns).toHaveBeenCalledWith('session-1', '10@40');
    expect(agent.messages.map((m) => m.id)).toEqual(['u8', 'u9', 'u10', 'u11']);
    expect(agent.olderCursor).toBe('8@32');
    expect(agent.loadingOlderTurns).toBe(false);
  });

  it('does nothing once the whole thread is loaded', async () => {
    seed([msg('u0')], null);
    await useAgentStore.getState().loadOlderTurns('session-1');
    expect(loadOlderTurns).not.toHaveBeenCalled();
  });

  it('replaces the window when the main process reports a stale cursor', async () => {
    seed([msg('u10'), msg('u11')], '10@40');
    loadOlderTurns.mockResolvedValue({ messages: [msg('s0'), msg('u11')], olderCursor: null, replaces: true });

    await useAgentStore.getState().loadOlderTurns('session-1');

    const agent = useAgentStore.getState().agents['session-1'];
    expect(agent.messages.map((m) => m.id)).toEqual(['s0', 'u11']);
    expect(agent.olderCursor).toBeNull();
  });

  it('discards a page that lands after messages_loaded replaced the window', async () => {
    seed([msg('u10'), msg('u11')], '10@40');
    const deferred = createDeferred<ChatHistoryPage>();
    loadOlderTurns.mockReturnValue(deferred.promise);

    const pending = useAgentStore.getState().loadOlderTurns('session-1');
    handleAgentStreamEvent(
      { type: 'messages_loaded', sessionId: 'session-1', messages: [msg('c0'), msg('u11')], olderCursor: '3@7' },
      useAgentStore.setState,
      useAgentStore.getState,
      vi.fn(),
    );
    deferred.resolve({ messages: [msg('u8'), msg('u9')], olderCursor: '8@32' });
    await pending;

    const agent = useAgentStore.getState().agents['session-1'];
    expect(agent.messages.map((m) => m.id)).toEqual(['c0', 'u11']);
    expect(agent.olderCursor).toBe('3@7');
    expect(agent.loadingOlderTurns).toBe(false);
  });

  it('ignores a second request while one is in flight', async () => {
    seed([msg('u10')], '10@40');
    const deferred = createDeferred<ChatHistoryPage>();
    loadOlderTurns.mockReturnValue(deferred.promise);

    const first = useAgentStore.getState().loadOlderTurns('session-1');
    await useAgentStore.getState().loadOlderTurns('session-1');
    expect(loadOlderTurns).toHaveBeenCalledTimes(1);

    deferred.resolve({ messages: [msg('u9')], olderCursor: null });
    await first;
  });
});
