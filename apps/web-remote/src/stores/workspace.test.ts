import { beforeEach, describe, expect, it } from 'vitest';
import { useConnectionStore } from './connection';
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

  /** A promise the test settles by hand, standing in for a slow host. */
  function deferred() {
    let resolve!: (value: unknown) => void;
    let reject!: (err: Error) => void;
    const promise = new Promise<unknown>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  function withSessionsClient(requestSessions: (workspaceId: string) => Promise<unknown>) {
    useConnectionStore.setState({ client: { requestSessions } as unknown as never });
  }

  it('files a reply under the workspace it asked for, whatever order replies arrive', async () => {
    const replies: Record<string, ReturnType<typeof deferred>> = {
      'workspace-a': deferred(),
      'workspace-b': deferred(),
    };
    withSessionsClient((workspaceId) => replies[workspaceId].promise);

    useWorkspaceStore.getState().fetchSessions('workspace-a');
    useWorkspaceStore.getState().fetchSessions('workspace-b');
    // B answers first, with sessions; A answers second, empty.
    replies['workspace-b'].resolve([session('session-b', 'workspace-b')]);
    replies['workspace-a'].resolve([]);
    await flush();

    const { sessionsByWorkspace } = useWorkspaceStore.getState();
    expect(sessionsByWorkspace['workspace-a']).toEqual([]);
    expect(sessionsByWorkspace['workspace-b']).toHaveLength(1);
  });

  it('keeps the newest reply when two fetches of one workspace finish out of order', async () => {
    const first = deferred();
    const second = deferred();
    const replies = [first, second];
    withSessionsClient(() => replies.shift()!.promise);

    useWorkspaceStore.getState().fetchSessions('workspace-a');
    useWorkspaceStore.getState().fetchSessions('workspace-a');
    second.resolve([session('fresh', 'workspace-a')]);
    first.resolve([]);
    await flush();

    expect(useWorkspaceStore.getState().sessionsByWorkspace['workspace-a']?.map((s) => s.id)).toEqual(['fresh']);
  });

  it('empties the requested workspace when the reply is empty', async () => {
    useWorkspaceStore.setState({
      sessionsByWorkspace: { 'workspace-a': [session('stale', 'workspace-a')] },
    });
    withSessionsClient(() => Promise.resolve([]));

    useWorkspaceStore.getState().fetchSessions('workspace-a');
    await flush();

    expect(useWorkspaceStore.getState().sessionsByWorkspace['workspace-a']).toEqual([]);
  });

  it('keeps the old list when the fetch fails', async () => {
    useWorkspaceStore.setState({
      sessionsByWorkspace: { 'workspace-a': [session('kept', 'workspace-a')] },
    });
    withSessionsClient(() => Promise.reject(new Error('Gateway connection closed.')));

    useWorkspaceStore.getState().fetchSessions('workspace-a');
    await flush();

    expect(useWorkspaceStore.getState().sessionsByWorkspace['workspace-a']).toHaveLength(1);
  });

  it('drops a session in the reply that names another workspace', async () => {
    withSessionsClient(() =>
      Promise.resolve([session('mine', 'workspace-a'), session('theirs', 'workspace-b')]),
    );

    useWorkspaceStore.getState().fetchSessions('workspace-a');
    await flush();

    expect(useWorkspaceStore.getState().sessionsByWorkspace['workspace-a']?.map((s) => s.id)).toEqual(['mine']);
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

describe('workspace store session delete', () => {
  const sessionA = {
    id: 'session-a',
    name: 'First',
    firstMessage: '',
    workspaceId: 'workspace-a',
    updatedAt: new Date(0).toISOString(),
    messageCount: 1,
  };
  const sessionB = { ...sessionA, id: 'session-b', name: 'Second' };

  beforeEach(() => {
    useWorkspaceStore.setState({
      sessionsByWorkspace: { 'workspace-a': [sessionA, sessionB] },
      activeSessionId: null,
    });
  });

  it('drops the deleted session from the workspace listing', () => {
    useWorkspaceStore.getState().handleMessage({
      type: 'ok',
      requestType: 'delete_session',
      data: { sessionId: 'session-a' },
    });

    expect(
      useWorkspaceStore.getState().sessionsByWorkspace['workspace-a'].map((s) => s.id),
    ).toEqual(['session-b']);
  });

  it('clears the active session when that session was deleted', () => {
    useWorkspaceStore.setState({ activeSessionId: 'session-a' });

    useWorkspaceStore.getState().handleMessage({
      type: 'ok',
      requestType: 'delete_session',
      data: { sessionId: 'session-a' },
    });

    expect(useWorkspaceStore.getState().activeSessionId).toBeNull();
  });

  it('keeps the active session when a different session was deleted', () => {
    useWorkspaceStore.setState({ activeSessionId: 'session-b' });

    useWorkspaceStore.getState().handleMessage({
      type: 'ok',
      requestType: 'delete_session',
      data: { sessionId: 'session-a' },
    });

    expect(useWorkspaceStore.getState().activeSessionId).toBe('session-b');
  });

  it('keeps every session when the host refuses the delete', () => {
    useWorkspaceStore.getState().handleMessage({
      type: 'error',
      requestType: 'delete_session',
      message: 'Workspace not authorized: workspace-a',
    });

    expect(
      useWorkspaceStore.getState().sessionsByWorkspace['workspace-a'].map((s) => s.id),
    ).toEqual(['session-a', 'session-b']);
  });
});
