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
