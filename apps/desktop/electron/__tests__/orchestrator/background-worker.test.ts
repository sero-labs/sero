import { afterEach, describe, expect, it } from 'vitest';

import type {
  AppRuntimeHost,
  AppRuntimeSubagentRunParams,
  AppRuntimeSubagentResult,
} from '@sero-ai/common';

import { createBackgroundWorkerAdapter } from '@plugins/sero-orchestrator-plugin/runtime/adapters/background-worker';
import type { AttemptContext } from '@plugins/sero-orchestrator-plugin/runtime/adapter';
import { WorkerSessionRegistry } from '@plugins/sero-orchestrator-plugin/runtime/recursion-guard';
import {
  DEFAULT_LOG_POLICY,
  DEFAULT_STOP_RULE,
  type LoopAttempt,
  type LoopGoal,
} from '@plugins/sero-orchestrator-plugin/shared/types';

import { createHarness, type Harness, type VerifyFn } from './harness';

// ── Adapter in isolation (hand-rolled host, full control) ────────────────────

interface FakeHostOptions {
  run: (params: AppRuntimeSubagentRunParams) => Promise<AppRuntimeSubagentResult>;
  porcelain?: string;
  diff?: string;
  onCommand?: (command: string) => void;
}

function fakeHost(opts: FakeHostOptions): AppRuntimeHost {
  return {
    subagents: {
      runStructured: opts.run,
      onLiveOutput: () => () => {},
    },
    workspace: {
      async runCommand(_ws: string, _cwd: string, command: string) {
        opts.onCommand?.(command);
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

function attemptCtx(overrides: Partial<AttemptContext> = {}): AttemptContext {
  const loop: LoopGoal = {
    id: 'loop-1',
    workspaceId: 'ws',
    executionMode: 'background-worker',
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
  };
  const attempt: LoopAttempt = {
    id: 'attempt-1',
    attemptNumber: 1,
    executionMode: 'background-worker',
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
    workspaceId: 'ws',
    signal: new AbortController().signal,
    ...overrides,
  } as AttemptContext;
}

describe('background-worker adapter (D-06/D-08/D-11/D-15)', () => {
  it('runs the worker at the attempt cwd and reports the measured diff', async () => {
    const seen: AppRuntimeSubagentRunParams[] = [];
    const host = fakeHost({
      run: async (params) => {
        seen.push(params);
        return {
          response: 'edited\n```json\n{ "summary": "did the thing", "outcome": "changes-made" }\n```',
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          modelId: 'opus',
        };
      },
      porcelain: ' M src/a.ts\n M src/b.ts\n',
      diff: 'diff --git a/src/a.ts b/src/a.ts',
    });
    const adapter = createBackgroundWorkerAdapter({ workerSessions: new WorkerSessionRegistry() });
    const ctx = attemptCtx({ host });

    const result = await adapter.execute(ctx);

    expect(result.status).toBe('completed');
    expect(result.changedFiles).toEqual(['src/a.ts', 'src/b.ts']);
    expect(result.diffFingerprint).toMatch(/^[0-9a-f]{40}$/);
    expect(result.summary).toBe('did the thing');
    expect(result.usage?.totalTokens).toBe(30);
    expect(result.model).toBe('opus');
    // Ran with the canonical cwd, the loop parent session (D-15), write tools (D-10).
    expect(seen[0]?.cwd).toBe('/ws');
    expect(seen[0]?.parentSessionId).toBe('orchestrator:loop-1');
    expect(seen[0]?.platformTools).toBe('all');
    // The (redacted) instruction is recorded for replay (D-08).
    expect(ctx.attempt.workerInstruction?.role).toBe('implementer');
  });

  it('marks the worker session active during the run and clears it after (D-16)', async () => {
    const registry = new WorkerSessionRegistry();
    let activeDuringRun = false;
    const host = fakeHost({
      run: async () => {
        // A non-synthetic parent must be caught via the live registry, not naming.
        activeDuringRun = registry.isWorkerSession('subagent-user-7-1');
        return { response: '' };
      },
    });
    const adapter = createBackgroundWorkerAdapter({ workerSessions: registry });
    const ctx = attemptCtx({ host });
    ctx.attempt.parentSessionId = 'user-7';

    await adapter.execute(ctx);

    expect(activeDuringRun).toBe(true);
    expect(registry.isWorkerSession('subagent-user-7-1')).toBe(false);
  });

  it('short-circuits to aborted on cancellation without probing git', async () => {
    const controller = new AbortController();
    controller.abort();
    let probed = false;
    const host = fakeHost({
      run: async () => ({ response: '', error: 'Aborted' }),
      onCommand: () => {
        probed = true;
      },
    });
    const adapter = createBackgroundWorkerAdapter({ workerSessions: new WorkerSessionRegistry() });
    const result = await adapter.execute(attemptCtx({ host, signal: controller.signal }));

    expect(result.status).toBe('aborted');
    expect(result.changedFiles).toEqual([]);
    expect(probed).toBe(false);
  });

  it('maps a non-abort error to status "error"', async () => {
    const host = fakeHost({ run: async () => ({ response: '', error: 'boom' }) });
    const adapter = createBackgroundWorkerAdapter({ workerSessions: new WorkerSessionRegistry() });
    const result = await adapter.execute(attemptCtx({ host }));
    expect(result.status).toBe('error');
    expect(result.error).toBe('boom');
  });
});

// ── End-to-end through the coordinator + real adapter ─────────────────────────

let active: Harness | null = null;
function use(harness: Harness): Harness {
  active = harness;
  return harness;
}
afterEach(() => {
  active?.cleanup();
  active = null;
});

const passVerdict = '```json\n{ "verdict": "pass", "summary": "ok" }\n```';
const changesMade = (n: number) =>
  `done\n\`\`\`json\n{ "summary": "attempt ${n}", "outcome": "changes-made" }\n\`\`\``;

describe('background-worker — end to end (Phase 3 acceptance)', () => {
  it('runs a failing-then-fixable goal to completion against one cwd', async () => {
    let checkCalls = 0;
    const verify: VerifyFn = (command) => ({
      command,
      success: checkCalls++ > 0, // attempt 1 fails, attempt 2+ pass
      stdout: '',
      stderr: checkCalls === 1 ? 'AssertionError' : '',
      durationMs: 4,
    });
    let attemptNo = 0;
    const h = use(
      createHarness({
        verify,
        // Dirty after attempt 1 → auto-save the prior work as a baseline.
        gate: { prompt: async () => 'auto-save' },
        runWorker: async (params) => {
          if (params.platformTools === 'readOnly') return { response: passVerdict };
          attemptNo += 1;
          return {
            response: changesMade(attemptNo),
            changedFiles: [`src/fix-${attemptNo}.ts`],
            diff: `diff-${attemptNo}`,
          };
        },
      }),
    );
    const loopId = await h.createLoop({
      checks: [{ type: 'command', command: 'pnpm test', required: true }],
    });

    const first = await h.coordinator.requestAction({ kind: 'run_next', loopId });
    expect(first.ok).toBe(true);
    let loop = await h.loop(loopId);
    expect(loop?.status).toBe('active');
    expect(loop?.attempts.at(-1)?.status).toBe('failed');

    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    loop = await h.loop(loopId);
    expect(loop?.status).toBe('complete');
    expect(loop?.attempts).toHaveLength(2);
    expect(loop?.attempts.at(-1)?.status).toBe('passed');
    // Both attempts ran against the same canonical cwd (D-06).
    const cwds = new Set(loop?.attempts.map((a) => a.workdir.cwd));
    expect(cwds.size).toBe(1);
    // Worker model/usage/duration and a response artifact were recorded.
    const last = loop?.attempts.at(-1);
    expect(last?.workerResponsePath).toBeDefined();
    expect(last?.workerInstruction?.role).toBe('implementer');
  });

  it('rolls a broken attempt back to its baseline (D-07)', async () => {
    const h = use(
      createHarness({
        verify: (command) => ({ command, success: true, stdout: '', stderr: '', durationMs: 1 }),
        runWorker: async () => ({
          error: 'worker crashed',
          changedFiles: ['src/broken.ts'],
          diff: 'partial',
        }),
      }),
    );
    const loopId = await h.createLoop({
      checks: [{ type: 'command', command: 'pnpm test', required: true }],
    });
    await h.coordinator.requestAction({ kind: 'run_next', loopId });

    const loop = await h.loop(loopId);
    expect(loop?.attempts.at(-1)?.status).toBe('failed');
    expect(loop?.status).toBe('active'); // retries
    // git reset --hard cleared the broken attempt's changes.
    expect(h.world.changed).toEqual([]);
  });

  it('accumulates worker tokens and blocks on maxTotalTokens (D-17/FR-27)', async () => {
    let n = 0;
    const h = use(
      createHarness({
        verify: (command) => ({ command, success: false, stdout: '', stderr: 'x', durationMs: 1 }),
        gate: { prompt: async () => 'auto-save' },
        runWorker: async (params) => {
          if (params.platformTools === 'readOnly') return { response: passVerdict };
          n += 1;
          return {
            response: changesMade(n),
            changedFiles: [`src/f-${n}.ts`],
            diff: `d-${n}`,
            usage: { inputTokens: 300, outputTokens: 300, totalTokens: 600 },
          };
        },
      }),
    );
    const loopId = await h.createLoop({
      checks: [{ type: 'command', command: 'pnpm test', required: true }],
      budget: { maxTotalTokens: 1000 },
    });

    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    expect((await h.loop(loopId))?.status).toBe('active'); // 600 < 1000
    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    const loop = await h.loop(loopId);
    expect(loop?.status).toBe('blocked'); // 1200 >= 1000
    expect(loop?.blockedReason).toBe('budget-exhausted');
    expect(loop?.attempts).toHaveLength(2);
  });
});

describe('background-worker — reviewer workers (D-10)', () => {
  it('passes when a required reviewer approves the changes', async () => {
    const h = use(
      createHarness({
        runWorker: async (params) => {
          if (params.platformTools === 'readOnly') return { response: passVerdict };
          return { response: changesMade(1), changedFiles: ['src/a.ts'], diff: 'd' };
        },
      }),
    );
    const loopId = await h.createLoop({
      checks: [{ type: 'review', reviewer: 'quality-reviewer', required: true }],
    });
    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    const loop = await h.loop(loopId);
    expect(loop?.status).toBe('complete');
    expect(loop?.attempts.at(-1)?.checkResults.at(0)?.status).toBe('passed');
  });

  it('fails the attempt when a required reviewer rejects the changes', async () => {
    const failVerdict = '```json\n{ "verdict": "fail", "summary": "needs tests" }\n```';
    const h = use(
      createHarness({
        runWorker: async (params) => {
          if (params.platformTools === 'readOnly') return { response: failVerdict };
          return { response: changesMade(1), changedFiles: ['src/a.ts'], diff: 'd' };
        },
      }),
    );
    const loopId = await h.createLoop({
      checks: [{ type: 'review', reviewer: 'quality-reviewer', required: true }],
    });
    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    const loop = await h.loop(loopId);
    expect(loop?.status).toBe('active'); // retry
    const review = loop?.attempts.at(-1)?.checkResults.at(0);
    expect(review?.status).toBe('failed');
    expect(review?.summary).toMatch(/needs tests/);
  });
});

describe('recursion guard (D-16/FR-22)', () => {
  it('rejects control actions from an orchestrator worker session', async () => {
    const h = use(createHarness());
    const loopId = await h.createLoop();
    const workerSource = { sessionId: 'subagent-orchestrator:loop-x-12345' };

    const created = await h.coordinator.requestAction(
      { kind: 'create', input: { title: 'sneaky', goal: 'spawn another loop' } },
      workerSource,
    );
    expect(created.ok).toBe(false);
    expect(created.error).toMatch(/workers cannot/i);

    const ran = await h.coordinator.requestAction({ kind: 'run_next', loopId }, workerSource);
    expect(ran.ok).toBe(false);
    expect(ran.error).toMatch(/workers cannot/i);
  });

  it('allows the same actions from a normal (non-worker) source', async () => {
    const h = use(createHarness());
    const created = await h.coordinator.requestAction(
      { kind: 'create', input: { title: 'ok', goal: 'legit goal' } },
      { sessionId: 'user-session-1' },
    );
    expect(created.ok).toBe(true);
  });

  it('allows read-only actions even from a worker session', async () => {
    const h = use(createHarness());
    const listed = await h.coordinator.requestAction(
      { kind: 'list' },
      { sessionId: 'subagent-orchestrator:loop-x-1' },
    );
    expect(listed.ok).toBe(true);
  });
});
