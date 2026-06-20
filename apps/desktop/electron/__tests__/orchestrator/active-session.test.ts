import { afterEach, describe, expect, it } from 'vitest';

import type {
  ActiveSession,
  AppRuntimeHost,
  SessionState,
  TurnCompletion,
  TurnCompletionStatus,
} from '@sero-ai/common';

import { createActiveSessionAdapter } from '@plugins/sero-orchestrator-plugin/runtime/adapters/active-session';
import type {
  AttemptContext,
  AttemptPreflightContext,
} from '@plugins/sero-orchestrator-plugin/runtime/adapter';
import { routeHybrid } from '@plugins/sero-orchestrator-plugin/runtime/hybrid';
import { WorkerSessionRegistry } from '@plugins/sero-orchestrator-plugin/runtime/recursion-guard';
import {
  DEFAULT_LOG_POLICY,
  DEFAULT_STOP_RULE,
  type LoopAttempt,
  type LoopGoal,
} from '@plugins/sero-orchestrator-plugin/shared/types';

import { createHarness, type Harness } from './harness';

// ── Adapter in isolation (hand-rolled host, full control over the session) ─────

interface FakeSessionHostOptions {
  active?: ActiveSession | null;
  state?: SessionState;
  turnId?: string;
  /** Turn completion status, or null to never complete (exercise the timeout). */
  completion?: TurnCompletionStatus | null;
  porcelain?: string;
  diff?: string;
  /** Invoked when a steer is sent — used to assert recursion-guard state mid-turn. */
  onSteer?: (sessionId: string, content: unknown) => void;
}

function fakeHost(opts: FakeSessionHostOptions): AppRuntimeHost {
  const active = opts.active === undefined ? { sessionId: 'live-1', workspaceId: 'ws' } : opts.active;
  const state = opts.state ?? { idle: true, pendingMessages: 0, activeTurnId: null };
  const listeners = new Set<(c: TurnCompletion) => void>();

  return {
    session: {
      async getActiveForWorkspace() {
        return active;
      },
      async getState() {
        return state;
      },
      async sendUserSteer(sessionId: string, content: unknown) {
        opts.onSteer?.(sessionId, content);
        const turnId = opts.turnId ?? 'turn-1';
        if (opts.completion !== null) {
          const status = opts.completion ?? 'completed';
          queueMicrotask(() => {
            for (const cb of [...listeners]) cb({ turnId, status });
          });
        }
        return { turnId };
      },
      async sendContextMessage() {
        return { turnId: null };
      },
      onTurnComplete(_sessionId: string, cb: (c: TurnCompletion) => void) {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    },
    workspace: {
      async runCommand(_ws: string, _cwd: string, command: string) {
        if (command === 'git status --porcelain') {
          return { stdout: opts.porcelain ?? '', stderr: '', exitCode: 0 };
        }
        if (command.startsWith('git diff')) {
          return { stdout: opts.diff ?? '', stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    },
  } as unknown as AppRuntimeHost;
}

function loopFixture(overrides: Partial<LoopGoal> = {}): LoopGoal {
  return {
    id: 'loop-1',
    workspaceId: 'ws',
    executionMode: 'active-session',
    title: 'Do it',
    goal: 'Achieve the goal.',
    status: 'active',
    triggers: [],
    checks: [{ type: 'command', command: 'pnpm test', required: true }],
    stopRule: DEFAULT_STOP_RULE,
    logPolicy: DEFAULT_LOG_POLICY,
    tasks: [],
    attempts: [],
    createdAt: 't',
    updatedAt: 't',
    ...overrides,
  };
}

function preflightCtx(host: AppRuntimeHost, loop = loopFixture()): AttemptPreflightContext {
  return { loop, host, workspaceId: 'ws', workspacePath: '/ws' };
}

function attemptCtx(host: AppRuntimeHost, overrides: Partial<AttemptContext> = {}): AttemptContext {
  const loop = overrides.loop ?? loopFixture();
  const attempt: LoopAttempt = {
    id: 'attempt-1',
    attemptNumber: 1,
    executionMode: 'active-session',
    status: 'running',
    workdir: { mode: 'workspace-root', workspaceRoot: '/ws', cwd: '/ws' },
    parentSessionId: 'orchestrator:loop-1',
    baseRef: 'HEAD0',
    changedFiles: [],
    checkResults: [],
    startedAt: 't',
  };
  return {
    loop,
    attempt,
    cwd: '/ws',
    host,
    workspaceId: 'ws',
    signal: new AbortController().signal,
    ...overrides,
  } as AttemptContext;
}

function adapter(workerSessions = new WorkerSessionRegistry()) {
  return createActiveSessionAdapter({ workerSessions });
}

describe('active-session adapter — preflight idle-gate (D-05)', () => {
  it('is ready when the target session is idle with no pending messages', async () => {
    const result = await adapter().preflight!(preflightCtx(fakeHost({})));
    expect(result.ready).toBe(true);
  });

  it('defers when a turn is in progress', async () => {
    const host = fakeHost({ state: { idle: false, pendingMessages: 0, activeTurnId: 'turn-x' } });
    const result = await adapter().preflight!(preflightCtx(host));
    expect(result).toEqual({ ready: false, reason: expect.stringMatching(/busy.*turn is in progress/i) });
  });

  it('defers when messages are pending', async () => {
    const host = fakeHost({ state: { idle: true, pendingMessages: 2, activeTurnId: null } });
    const result = await adapter().preflight!(preflightCtx(host));
    expect(result).toEqual({ ready: false, reason: expect.stringMatching(/busy.*pending/i) });
  });

  it('defers when there is no active session to steer', async () => {
    const result = await adapter().preflight!(preflightCtx(fakeHost({ active: null })));
    expect(result).toEqual({ ready: false, reason: expect.stringMatching(/no active session/i) });
  });

  it('defers when the bound session is not the workspace active session', async () => {
    const host = fakeHost({ active: { sessionId: 'someone-else', workspaceId: 'ws' } });
    const loop = loopFixture({ sessionId: 'bound-session' });
    const result = await adapter().preflight!(preflightCtx(host, loop));
    expect(result).toEqual({ ready: false, reason: expect.stringMatching(/bound session is not the active/i) });
  });
});

describe('active-session adapter — execute (D-05/D-06)', () => {
  it('steers the session, correlates completion by turn id, and measures the diff', async () => {
    let steerContent: unknown;
    const host = fakeHost({
      turnId: 'turn-7',
      completion: 'completed',
      porcelain: ' M src/a.ts\n M src/b.ts\n',
      diff: 'diff --git a/src/a.ts b/src/a.ts',
      onSteer: (_id, content) => {
        steerContent = content;
      },
    });
    const ctx = attemptCtx(host);

    const result = await adapter().execute(ctx);

    expect(result.status).toBe('completed');
    expect(result.sessionTurnId).toBe('turn-7');
    expect(result.changedFiles).toEqual(['src/a.ts', 'src/b.ts']);
    expect(result.diffFingerprint).toMatch(/^[0-9a-f]{40}$/);
    // The steer carries the generated task prompt, recorded for replay (D-08).
    expect(typeof steerContent).toBe('string');
    expect(steerContent).toContain('Achieve the goal.');
    expect(ctx.attempt.workerInstruction?.role).toBe('implementer');
  });

  it('rejects a worktree workdir — active-session is workspace-root only (D-06)', async () => {
    const ctx = attemptCtx(fakeHost({}));
    ctx.attempt.workdir = {
      mode: 'worktree',
      workspaceRoot: '/ws',
      cwd: '/ws/.sero/worktrees/card-1',
      worktreePath: '/ws/.sero/worktrees/card-1',
    };
    const result = await adapter().execute(ctx);
    expect(result.status).toBe('error');
    expect(result.error).toMatch(/workspace root/i);
  });

  it('maps a non-completed turn to an error result', async () => {
    const host = fakeHost({ turnId: 'turn-9', completion: 'error' });
    const result = await adapter().execute(attemptCtx(host));
    expect(result.status).toBe('error');
    expect(result.sessionTurnId).toBe('turn-9');
    expect(result.error).toMatch(/error/i);
  });

  it('reports an error when the turn is never observed within the window', async () => {
    const host = fakeHost({ completion: null });
    const result = await adapter().execute(attemptCtx(host, { timeoutMs: 5 }));
    expect(result.status).toBe('error');
    expect(result.error).toMatch(/did not complete/i);
  });

  it('holds the steered session as a worker for the turn, then releases it (D-16)', async () => {
    const registry = new WorkerSessionRegistry();
    let activeDuringTurn = false;
    const host = fakeHost({
      onSteer: (sessionId) => {
        activeDuringTurn = registry.isWorkerSession(sessionId);
      },
    });
    await adapter(registry).execute(attemptCtx(host));
    expect(activeDuringTurn).toBe(true);
    expect(registry.isWorkerSession('live-1')).toBe(false);
  });
});

// ── End to end through the coordinator + real adapter (Phase 4 acceptance) ─────

let active: Harness | null = null;
function use(harness: Harness): Harness {
  active = harness;
  return harness;
}
afterEach(() => {
  active?.cleanup();
  active = null;
});

describe('active-session — end to end (Phase 4 acceptance)', () => {
  it('steers an idle session to completion, observing the turn and running checks', async () => {
    const h = use(
      createHarness({
        session: { steer: async () => ({ changedFiles: ['src/a.ts'], diff: 'd' }) },
      }),
    );
    const loopId = await h.createLoop({
      executionMode: 'active-session',
      checks: [{ type: 'command', command: 'pnpm test', required: true }],
    });

    const result = await h.coordinator.requestAction({ kind: 'run_next', loopId });
    expect(result.ok).toBe(true);

    const loop = await h.loop(loopId);
    expect(loop?.status).toBe('complete');
    const attempt = loop?.attempts.at(-1);
    expect(attempt?.status).toBe('passed');
    expect(attempt?.executionMode).toBe('active-session');
    expect(attempt?.sessionTurnId).toBeDefined();
    // Active-session always runs at the workspace root (D-06).
    expect(attempt?.workdir.mode).toBe('workspace-root');
    expect(attempt?.workdir.cwd).toBe(attempt?.workdir.workspaceRoot);
  });

  it('defers (no attempt) when the target session is busy, retrying on the next trigger', async () => {
    const h = use(
      createHarness({
        session: { state: { idle: false, pendingMessages: 0, activeTurnId: 'turn-x' } },
      }),
    );
    const loopId = await h.createLoop({ executionMode: 'active-session' });

    const first = await h.coordinator.requestAction({ kind: 'run_next', loopId });
    expect(first.ok).toBe(true);
    expect(first.message).toMatch(/deferred/i);
    expect(first.message).toMatch(/busy/i);

    // A second trigger while still busy defers again — never burning an attempt,
    // so a busy session can never trip the no-progress block.
    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    const loop = await h.loop(loopId);
    expect(loop?.attempts).toHaveLength(0);
    expect(loop?.status).toBe('active');
    expect(loop?.statusReason).toMatch(/busy/i);
  });

  it('keeps a failing turn’s changes and completes on the next idle steer', async () => {
    let checkCalls = 0;
    let turn = 0;
    const h = use(
      createHarness({
        verify: (command) => ({
          command,
          success: checkCalls++ > 0, // attempt 1 fails, attempt 2 passes
          stdout: '',
          stderr: checkCalls === 1 ? 'AssertionError' : '',
          durationMs: 2,
        }),
        // Attempt 1 keeps its change, so attempt 2 starts dirty → auto-save the
        // prior work as a baseline before the next idle steer.
        gate: { prompt: async () => 'auto-save' },
        session: {
          steer: async () => {
            turn += 1;
            return { changedFiles: [`src/turn-${turn}.ts`], diff: `d-${turn}` };
          },
        },
      }),
    );
    const loopId = await h.createLoop({
      executionMode: 'active-session',
      checks: [{ type: 'command', command: 'pnpm test', required: true }],
    });

    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    let loop = await h.loop(loopId);
    expect(loop?.status).toBe('active');
    expect(loop?.attempts.at(-1)?.status).toBe('failed');

    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    loop = await h.loop(loopId);
    expect(loop?.status).toBe('complete');
    expect(loop?.attempts).toHaveLength(2);
    expect(loop?.attempts.every((a) => a.executionMode === 'active-session')).toBe(true);
  });
});

// ── Hybrid routing (D-09) ──────────────────────────────────────────────────────

describe('hybrid routing — routeHybrid (D-09)', () => {
  const idle = { available: true, idle: true };
  const busy = { available: true, idle: false };
  const none = { available: false, idle: false };

  it('always routes a worktree attempt to the background worker', () => {
    for (const policy of ['prefer-active-session', 'active-if-session-idle', 'ask-user'] as const) {
      const route = routeHybrid({ policy, session: idle, useWorktree: true });
      expect(route.mode).toBe('background-worker');
      expect(route.reason).toMatch(/worktree/i);
    }
  });

  it('prefer-background-worker → background worker', () => {
    expect(routeHybrid({ policy: 'prefer-background-worker', session: idle, useWorktree: false }).mode).toBe(
      'background-worker',
    );
  });

  it('prefer-active-session → active session when one exists, else worker', () => {
    expect(routeHybrid({ policy: 'prefer-active-session', session: busy, useWorktree: false }).mode).toBe(
      'active-session',
    );
    expect(routeHybrid({ policy: 'prefer-active-session', session: none, useWorktree: false }).mode).toBe(
      'background-worker',
    );
  });

  it('active-if-session-idle → active session only when idle', () => {
    expect(routeHybrid({ policy: 'active-if-session-idle', session: idle, useWorktree: false }).mode).toBe(
      'active-session',
    );
    expect(routeHybrid({ policy: 'active-if-session-idle', session: busy, useWorktree: false }).mode).toBe(
      'background-worker',
    );
    expect(routeHybrid({ policy: 'active-if-session-idle', session: none, useWorktree: false }).mode).toBe(
      'background-worker',
    );
  });

  it('ask-user → background worker until an interactive round-trip exists', () => {
    expect(routeHybrid({ policy: 'ask-user', session: idle, useWorktree: false }).mode).toBe(
      'background-worker',
    );
  });
});

describe('hybrid routing — end to end (records the chosen mode + reason)', () => {
  const changesMade = '```json\n{ "summary": "did it", "outcome": "changes-made" }\n```';

  it('routes active-if-session-idle to the active session when idle', async () => {
    const h = use(
      createHarness({
        session: { steer: async () => ({ changedFiles: ['src/a.ts'], diff: 'd' }) },
        runWorker: async () => ({ response: changesMade, changedFiles: ['src/worker.ts'], diff: 'w' }),
      }),
    );
    const loopId = await h.createLoop({
      executionMode: 'hybrid',
      hybridPolicy: 'active-if-session-idle',
      checks: [{ type: 'command', command: 'pnpm test', required: true }],
    });
    await h.coordinator.requestAction({ kind: 'run_next', loopId });

    const attempt = (await h.loop(loopId))?.attempts.at(-1);
    expect(attempt?.executionMode).toBe('active-session');
    expect(attempt?.routingReason).toMatch(/idle/i);
  });

  it('routes active-if-session-idle to the background worker when the session is busy', async () => {
    const h = use(
      createHarness({
        session: {
          state: { idle: false, pendingMessages: 0, activeTurnId: 'turn-x' },
          steer: async () => ({ changedFiles: ['src/a.ts'], diff: 'd' }),
        },
        runWorker: async () => ({ response: changesMade, changedFiles: ['src/worker.ts'], diff: 'w' }),
      }),
    );
    const loopId = await h.createLoop({
      executionMode: 'hybrid',
      hybridPolicy: 'active-if-session-idle',
      checks: [{ type: 'command', command: 'pnpm test', required: true }],
    });
    await h.coordinator.requestAction({ kind: 'run_next', loopId });

    const attempt = (await h.loop(loopId))?.attempts.at(-1);
    expect(attempt?.executionMode).toBe('background-worker');
    expect(attempt?.routingReason).toMatch(/busy/i);
  });
});
