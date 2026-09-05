import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A finished turn also records a feed entry. The feed writes under
// SERO_HOME, so it is replaced here with a recorder.
const notified: Array<Record<string, unknown>> = [];
vi.mock('@electron/features/notifications/feed', () => ({
  notify: (options: Record<string, unknown>) => {
    notified.push(options);
    return { id: 'entry', ts: Date.now(), source: 'Session', type: 'info', message: '', read: false };
  },
}));


import {
  forwardEventToGateway,
  installGatewayAgentOps,
  publishSessionState,
  setGatewayEventSink,
  subscribeGatewayEvents,
} from '@electron/features/gateway/bridge/agent-bridge';
import type { GatewayAgentOps } from '@electron/features/gateway/server/types';
import type { GatewayPushEvent } from '@electron/features/gateway/server/protocol';
import type { GatewayTurnCompleteEvent } from '@electron/features/gateway/server/protocol-events';

function createPushMock() {
  return vi.fn((_sessionId: string, _event: GatewayPushEvent) => {});
}

function createBroadcastMock() {
  return vi.fn((_workspaceId: string, _event: GatewayPushEvent) => {});
}

/** The one `turn_complete` a finished turn broadcasts. Fails loudly if absent. */
function findTurnComplete(
  broadcast: ReturnType<typeof createBroadcastMock>,
): GatewayTurnCompleteEvent {
  const event = broadcast.mock.calls
    .map(([, pushed]) => pushed)
    .find((pushed) => pushed.type === 'turn_complete');
  if (!event) throw new Error('no turn_complete was broadcast');
  return event;
}

const WORKSPACE_ID = 'ws-1';
const SESSION_ID = 'session-1';

/**
 * The bridge only calls `getSessionWorkspaceId`. Building all sixteen
 * pool operations would say nothing about the behaviour under test.
 */
function installOpsForSession(workspaceId: string | null): void {
  installGatewayAgentOps({
    getSessionWorkspaceId: () => workspaceId,
  } as unknown as GatewayAgentOps);
}

describe('gateway agent bridge listeners', () => {
  let sinkPush: ReturnType<typeof createPushMock>;
  let sinkBroadcast: ReturnType<typeof createBroadcastMock>;

  beforeEach(() => {
    sinkPush = createPushMock();
    sinkBroadcast = createBroadcastMock();
    setGatewayEventSink({ pushEvent: sinkPush, broadcastWorkspaceEvent: sinkBroadcast });
    installOpsForSession(WORKSPACE_ID);
    notified.length = 0;
  });

  afterEach(() => {
    setGatewayEventSink({ pushEvent: () => {}, broadcastWorkspaceEvent: () => {} });
    installOpsForSession(null);
  });

  it('forwards mapped events to sink and subscribed listeners', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeGatewayEvents(listener);

    forwardEventToGateway({
      type: 'text_delta',
      sessionId: SESSION_ID,
      delta: 'hello',
    });

    expect(sinkPush).toHaveBeenCalledWith(SESSION_ID, {
      type: 'text_delta',
      sessionId: SESSION_ID,
      delta: 'hello',
    });
    expect(listener).toHaveBeenCalledWith({
      type: 'text_delta',
      sessionId: SESSION_ID,
      delta: 'hello',
    });

    unsubscribe();

    forwardEventToGateway({
      type: 'text_delta',
      sessionId: SESSION_ID,
      delta: 'world',
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('broadcasts agent_start by workspace and reports the session running', () => {
    forwardEventToGateway({ type: 'agent_start', sessionId: SESSION_ID });

    expect(sinkPush).not.toHaveBeenCalled();
    const broadcasts = sinkBroadcast.mock.calls.map(([workspaceId, event]) => [workspaceId, event]);

    expect(broadcasts[0][0]).toBe(WORKSPACE_ID);
    expect(broadcasts[0][1]).toEqual({
      type: 'agent_start',
      workspaceId: WORKSPACE_ID,
      sessionId: SESSION_ID,
    });
    expect(broadcasts[1][1]).toMatchObject({
      type: 'session_state',
      workspaceId: WORKSPACE_ID,
      sessionId: SESSION_ID,
      state: 'running',
    });
  });

  it('reports turn completion with the last message snippet, then idle', () => {
    forwardEventToGateway({ type: 'agent_start', sessionId: SESSION_ID });
    forwardEventToGateway({ type: 'message_start', sessionId: SESSION_ID });
    forwardEventToGateway({ type: 'text_delta', sessionId: SESSION_ID, delta: 'first message' });
    forwardEventToGateway({ type: 'message_start', sessionId: SESSION_ID });
    forwardEventToGateway({ type: 'text_delta', sessionId: SESSION_ID, delta: 'the answer' });
    sinkBroadcast.mockClear();

    forwardEventToGateway({ type: 'agent_end', sessionId: SESSION_ID, outcome: 'completed' });

    const events = sinkBroadcast.mock.calls.map(([, event]) => event);
    expect(events[0]).toMatchObject({ type: 'agent_end', workspaceId: WORKSPACE_ID });
    expect(events[1]).toMatchObject({
      type: 'turn_complete',
      workspaceId: WORKSPACE_ID,
      sessionId: SESSION_ID,
      outcome: 'completed',
      snippet: 'the answer',
    });
    expect(events[2]).toMatchObject({ type: 'session_state', state: 'idle' });
  });

  it('caps the snippet at 140 characters', () => {
    forwardEventToGateway({ type: 'message_start', sessionId: SESSION_ID });
    forwardEventToGateway({ type: 'text_delta', sessionId: SESSION_ID, delta: 'a'.repeat(300) });
    forwardEventToGateway({ type: 'agent_end', sessionId: SESSION_ID, outcome: 'completed' });

    const turn = findTurnComplete(sinkBroadcast);
    expect(turn.snippet).toHaveLength(140);
  });

  it('carries the agent_end outcome through to turn_complete', () => {
    forwardEventToGateway({ type: 'agent_end', sessionId: SESSION_ID, outcome: 'cancelled' });

    const turn = findTurnComplete(sinkBroadcast);
    expect(turn.outcome).toBe('cancelled');
  });

  it('records a finished turn in the notification feed, without a toast', () => {
    forwardEventToGateway({ type: 'message_start', sessionId: SESSION_ID });
    forwardEventToGateway({ type: 'text_delta', sessionId: SESSION_ID, delta: 'the answer' });
    forwardEventToGateway({ type: 'agent_end', sessionId: SESSION_ID, outcome: 'completed' });

    expect(notified).toEqual([{
      message: 'the answer',
      type: 'info',
      source: 'Session',
      workspaceId: WORKSPACE_ID,
      silentOnDesktop: true,
    }]);
  });

  it('records a failed turn as an error in the feed', () => {
    forwardEventToGateway({ type: 'agent_end', sessionId: SESSION_ID, outcome: 'error' });

    expect(notified[0]).toMatchObject({ type: 'error', message: 'The agent finished its turn.' });
  });

  it('publishes awaiting_input for the choice bridge', () => {
    publishSessionState(SESSION_ID, 'awaiting_input');

    expect(sinkBroadcast).toHaveBeenCalledWith(WORKSPACE_ID, expect.objectContaining({
      type: 'session_state',
      sessionId: SESSION_ID,
      state: 'awaiting_input',
    }));
  });

  it('sends nothing when the session has no workspace', () => {
    installOpsForSession(null);

    forwardEventToGateway({ type: 'agent_start', sessionId: SESSION_ID });
    publishSessionState(SESSION_ID, 'awaiting_input');

    expect(sinkBroadcast).not.toHaveBeenCalled();
    expect(sinkPush).not.toHaveBeenCalled();
  });
});
