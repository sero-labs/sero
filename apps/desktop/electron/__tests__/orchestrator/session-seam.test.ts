import { describe, expect, it } from 'vitest';
import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type {
  ActiveSession,
  AppRuntimeHost,
  AppRuntimeSessionHost,
  SessionState,
  TurnCompletion,
} from '@sero-ai/common';

import { createSessionHost } from '@electron/features/apps/runtime/capabilities/session-host';
import {
  installCliSessionBridge,
  type CliSessionEntry,
} from '@electron/cli/bridges/session-bridge';
import { noteCliTurnEnd, noteCliTurnStart } from '@electron/cli/bridges/agent-bridge';
import { WorkspaceCoordinator } from '@plugins/sero-orchestrator-plugin/runtime/coordinator';

// ── Session host wrapper (create-host's host.session) ─────────────────────────
//
// Drives the real agent-bridge turn emitter through a fake CLI session bridge,
// so the wrapper's resolve / idle-gate / send / observe path is exercised end to
// end. Distinct session ids keep the process-wide bridge state from leaking
// between tests.

interface WrapperSetup {
  host: AppRuntimeSessionHost;
  setStreaming(value: boolean): void;
  setActiveTurnId(value: string | null): void;
  setPending(value: number): void;
}

function setupWrapper(sessionId: string, workspaceId = 'ws-1'): WrapperSetup {
  const agentState = { isStreaming: false };
  let pendingMessageCount = 0;
  let activeTurnId: string | null = null;

  const session = {
    agent: { state: agentState },
    get pendingMessageCount() {
      return pendingMessageCount;
    },
    sendUserMessage: async () => {
      noteCliTurnStart(sessionId);
    },
    sendCustomMessage: async (_message: unknown, options?: { triggerTurn?: boolean }) => {
      if (options?.triggerTurn) noteCliTurnStart(sessionId);
    },
  } as unknown as AgentSession;

  const entry: CliSessionEntry = { sessionId, workspaceId, session, lastSessionName: 'My session' };

  installCliSessionBridge({
    getSessionEntry: (id) => (id === sessionId ? entry : undefined),
    getActiveSessionForWorkspace: (ws) => (ws === workspaceId ? entry : undefined),
    getActiveTurnId: () => activeTurnId,
    noteTurnStart: noteCliTurnStart,
    noteTurnEnd: noteCliTurnEnd,
    consumeTurnBudget: () => ({ allowed: true, count: 0, limit: 50 }),
    setSessionTitle: () => {},
  });

  return {
    host: createSessionHost(),
    setStreaming: (value) => {
      agentState.isStreaming = value;
    },
    setActiveTurnId: (value) => {
      activeTurnId = value;
    },
    setPending: (value) => {
      pendingMessageCount = value;
    },
  };
}

describe('host.session wrapper', () => {
  it('resolves the workspace active session, or null when none matches', async () => {
    const { host } = setupWrapper('seam-A');
    expect(await host.getActiveForWorkspace('ws-1')).toEqual({
      sessionId: 'seam-A',
      workspaceId: 'ws-1',
      title: 'My session',
    });
    expect(await host.getActiveForWorkspace('other-ws')).toBeNull();
  });

  it('reports idle vs busy state', async () => {
    const setup = setupWrapper('seam-B');
    expect(await setup.host.getState('seam-B')).toEqual({
      idle: true,
      pendingMessages: 0,
      activeTurnId: null,
    });

    setup.setStreaming(true);
    setup.setActiveTurnId('turn-x');
    setup.setPending(1);
    expect(await setup.host.getState('seam-B')).toEqual({
      idle: false,
      pendingMessages: 1,
      activeTurnId: 'turn-x',
    });
  });

  it('sends a context message, returns the triggered turn id, and observes its completion', async () => {
    const { host } = setupWrapper('seam-C');
    const completions: TurnCompletion[] = [];
    host.onTurnComplete('seam-C', (c) => completions.push(c));

    const { turnId } = await host.sendContextMessage(
      'seam-C',
      { customType: 'orchestrator-diagnostic', content: 'hi', display: false },
      { triggerTurn: true, deliverAs: 'nextTurn', source: 'orchestrator' },
    );
    expect(turnId).toMatch(/^turn-/);

    noteCliTurnEnd('seam-C', 'completed');
    expect(completions).toEqual([{ turnId, status: 'completed' }]);
  });

  it('returns a null turn id when the context message does not trigger a turn', async () => {
    const { host } = setupWrapper('seam-D');
    const { turnId } = await host.sendContextMessage(
      'seam-D',
      { customType: 'orchestrator-diagnostic', content: 'hi', display: false },
      { triggerTurn: false, deliverAs: 'nextTurn', source: 'orchestrator' },
    );
    expect(turnId).toBeNull();
  });
});

// ── Coordinator diagnostic (the spike proof) ─────────────────────────────────

interface FakeSessionConfig {
  active: ActiveSession | null;
  state?: SessionState;
  sendTurnId?: string | null;
  completion?: TurnCompletion | null;
}

function fakeSessionHost(config: FakeSessionConfig): {
  session: AppRuntimeSessionHost;
  sendCount: () => number;
} {
  const completeListeners = new Set<(c: TurnCompletion) => void>();
  let sendCount = 0;

  const session: AppRuntimeSessionHost = {
    async getActiveForWorkspace() {
      return config.active;
    },
    async getState() {
      return config.state ?? { idle: true, pendingMessages: 0, activeTurnId: null };
    },
    async sendUserSteer() {
      throw new Error('not exercised');
    },
    async sendContextMessage() {
      sendCount += 1;
      const turnId = config.sendTurnId === undefined ? 'turn-diag' : config.sendTurnId;
      // Fire completion synchronously to exercise the "completes before send
      // resolves" race the coordinator must tolerate.
      if (config.completion) for (const cb of [...completeListeners]) cb(config.completion);
      return { turnId };
    },
    onTurnComplete(_sessionId, cb) {
      completeListeners.add(cb);
      return () => completeListeners.delete(cb);
    },
  };

  return { session, sendCount: () => sendCount };
}

function makeCoordinator(session: AppRuntimeSessionHost): WorkspaceCoordinator {
  // diagnoseSession only touches host.session; the rest of the host is unused.
  const host = { session } as unknown as AppRuntimeHost;
  return new WorkspaceCoordinator({
    host,
    workspaceId: 'ws-1',
    workspacePath: '/ws',
    stateFilePath: '/ws/.sero/apps/orchestrator/state.json',
  });
}

describe('coordinator.diagnoseSession (Phase 1.5 spike)', () => {
  it('reports when there is no active session', async () => {
    const { session, sendCount } = fakeSessionHost({ active: null });
    const result = await makeCoordinator(session).requestAction({ kind: 'diagnose_session' });
    expect(result.ok).toBe(true);
    expect(result.message).toContain('No active session');
    expect(sendCount()).toBe(0);
  });

  it('defers without sending when a turn is in progress', async () => {
    const { session, sendCount } = fakeSessionHost({
      active: { sessionId: 's1', workspaceId: 'ws-1' },
      state: { idle: false, pendingMessages: 0, activeTurnId: 'turn-x' },
    });
    const result = await makeCoordinator(session).requestAction({ kind: 'diagnose_session' });
    expect(result.message).toContain('Deferred');
    expect(result.message).toContain('turn is in progress');
    expect(sendCount()).toBe(0);
  });

  it('defers without sending when messages are pending', async () => {
    const { session, sendCount } = fakeSessionHost({
      active: { sessionId: 's1', workspaceId: 'ws-1' },
      state: { idle: true, pendingMessages: 2, activeTurnId: null },
    });
    const result = await makeCoordinator(session).requestAction({ kind: 'diagnose_session' });
    expect(result.message).toContain('Deferred');
    expect(result.message).toContain('pending');
    expect(sendCount()).toBe(0);
  });

  it('sends when idle and correlates the completion by turn id', async () => {
    const { session, sendCount } = fakeSessionHost({
      active: { sessionId: 's1', workspaceId: 'ws-1' },
      state: { idle: true, pendingMessages: 0, activeTurnId: null },
      sendTurnId: 'turn-42',
      completion: { turnId: 'turn-42', status: 'completed' },
    });
    const result = await makeCoordinator(session).requestAction({ kind: 'diagnose_session' });
    expect(sendCount()).toBe(1);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('turn-42');
    expect(result.message).toContain('completed');
    expect(result.message).toContain('matched');
  });

  it('flags a turn-id correlation mismatch', async () => {
    const { session } = fakeSessionHost({
      active: { sessionId: 's1', workspaceId: 'ws-1' },
      state: { idle: true, pendingMessages: 0, activeTurnId: null },
      sendTurnId: 'turn-42',
      completion: { turnId: 'turn-99', status: 'completed' },
    });
    const result = await makeCoordinator(session).requestAction({ kind: 'diagnose_session' });
    expect(result.message).toContain('MISMATCH');
  });

  it('errors when the send returns no turn id', async () => {
    const { session } = fakeSessionHost({
      active: { sessionId: 's1', workspaceId: 'ws-1' },
      state: { idle: true, pendingMessages: 0, activeTurnId: null },
      sendTurnId: null,
    });
    const result = await makeCoordinator(session).requestAction({ kind: 'diagnose_session' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('no turn id');
  });
});
