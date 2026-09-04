import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkspaceStore } from './workspace';

describe('workspace store session state', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ sessionStates: {}, lastTurns: {} });
  });

  it('records session state for a session it is not viewing', () => {
    useWorkspaceStore.setState({ activeSessionId: 'session-a' });

    useWorkspaceStore.getState().handleMessage({
      type: 'session_state',
      workspaceId: 'workspace-a',
      sessionId: 'session-b',
      state: 'running',
      ts: 1,
    });

    expect(useWorkspaceStore.getState().sessionStates['session-b']).toBe('running');
  });

  it('overwrites the previous state for a session', () => {
    const { handleMessage } = useWorkspaceStore.getState();
    const event = {
      type: 'session_state' as const,
      workspaceId: 'workspace-a',
      sessionId: 'session-a',
      ts: 1,
    };

    handleMessage({ ...event, state: 'running' });
    handleMessage({ ...event, state: 'awaiting_input' });
    handleMessage({ ...event, state: 'idle' });

    expect(useWorkspaceStore.getState().sessionStates['session-a']).toBe('idle');
  });

  it('ignores a session state it does not recognise', () => {
    useWorkspaceStore.getState().handleMessage({
      type: 'session_state',
      workspaceId: 'workspace-a',
      sessionId: 'session-a',
      state: 'exploded',
      ts: 1,
    });

    expect(useWorkspaceStore.getState().sessionStates['session-a']).toBeUndefined();
  });

  it('records the last finished turn with its snippet', () => {
    useWorkspaceStore.getState().handleMessage({
      type: 'turn_complete',
      workspaceId: 'workspace-a',
      sessionId: 'session-a',
      ts: 1700,
      outcome: 'completed',
      snippet: 'Done. The tests pass.',
    });

    expect(useWorkspaceStore.getState().lastTurns['session-a']).toEqual({
      ts: 1700,
      outcome: 'completed',
      snippet: 'Done. The tests pass.',
    });
  });

  it('falls back to a completed outcome when the event omits it', () => {
    useWorkspaceStore.getState().handleMessage({
      type: 'turn_complete',
      workspaceId: 'workspace-a',
      sessionId: 'session-a',
      ts: 1700,
    });

    expect(useWorkspaceStore.getState().lastTurns['session-a'].outcome).toBe('completed');
  });
});

describe('workspace store session tree', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      workspaces: [],
      sessionsByWorkspace: {},
      pendingSessionFetches: [],
      expanded: {},
      activeWorkspaceId: null,
      activeSessionId: null,
      view: 'chat',
    });
  });

  function session(id: string, workspaceId: string) {
    return {
      id,
      name: id,
      firstMessage: '',
      workspaceId,
      updatedAt: '2026-09-04T00:00:00.000Z',
      messageCount: 3,
    };
  }

  it('files sessions under the workspace each one names', () => {
    useWorkspaceStore.setState({ pendingSessionFetches: ['workspace-a'] });

    useWorkspaceStore.getState().handleMessage({
      type: 'ok',
      requestType: 'list_sessions',
      data: [session('session-a', 'workspace-a'), session('session-b', 'workspace-a')],
    });

    const { sessionsByWorkspace, pendingSessionFetches } = useWorkspaceStore.getState();
    expect(sessionsByWorkspace['workspace-a']).toHaveLength(2);
    expect(pendingSessionFetches).toEqual([]);
  });

  it('empties the requested workspace when the response is empty', () => {
    useWorkspaceStore.setState({
      sessionsByWorkspace: { 'workspace-a': [session('stale', 'workspace-a')] },
      pendingSessionFetches: ['workspace-a'],
    });

    useWorkspaceStore.getState().handleMessage({
      type: 'ok',
      requestType: 'list_sessions',
      data: [],
    });

    expect(useWorkspaceStore.getState().sessionsByWorkspace['workspace-a']).toEqual([]);
  });

  it('answers queued requests in order', () => {
    useWorkspaceStore.setState({ pendingSessionFetches: ['workspace-a', 'workspace-b'] });
    const { handleMessage } = useWorkspaceStore.getState();

    handleMessage({ type: 'ok', requestType: 'list_sessions', data: [] });
    expect(useWorkspaceStore.getState().pendingSessionFetches).toEqual(['workspace-b']);

    handleMessage({
      type: 'ok',
      requestType: 'list_sessions',
      data: [session('session-b', 'workspace-b')],
    });

    const { sessionsByWorkspace } = useWorkspaceStore.getState();
    expect(sessionsByWorkspace['workspace-a']).toEqual([]);
    expect(sessionsByWorkspace['workspace-b']).toHaveLength(1);
  });

  it('puts a created session at the top of its workspace and selects it', () => {
    useWorkspaceStore.setState({
      sessionsByWorkspace: { 'workspace-a': [session('older', 'workspace-a')] },
    });

    useWorkspaceStore.getState().handleMessage({
      type: 'ok',
      requestType: 'create_session',
      data: session('fresh', 'workspace-a'),
    });

    const state = useWorkspaceStore.getState();
    expect(state.sessionsByWorkspace['workspace-a'].map((s) => s.id)).toEqual(['fresh', 'older']);
    expect(state.activeSessionId).toBe('fresh');
    expect(state.expanded['workspace-a']).toBe(true);
    expect(state.view).toBe('chat');
  });
});
