import { describe, expect, it, afterEach } from 'vitest';

import type {
  AttemptContext,
  AttemptExecutionResult,
} from '@plugins/sero-orchestrator-plugin/runtime/adapter';

import { createHarness, fakeAdapter, makeClock, delay, type Harness } from './harness';

// Background-worker-style adapter that just reports a fixed result. The Phase 2
// core treats this as the seam Phase 3/4 fill — it exercises the whole machine
// without real execution.
function completes(changedFiles: string[] = ['src/a.ts'], extra: Partial<AttemptExecutionResult> = {}) {
  return fakeAdapter('background-worker', async (): Promise<AttemptExecutionResult> => ({
    status: 'completed',
    changedFiles,
    ...extra,
  }));
}

let active: Harness | null = null;
function use(harness: Harness): Harness {
  active = harness;
  return harness;
}
afterEach(() => {
  active?.cleanup();
  active = null;
});

const failCheck = { type: 'command' as const, command: 'run-tests', required: true };
const failVerify = (command: string) => ({
  command,
  success: false,
  stdout: 'boom',
  stderr: 'AssertionError',
  durationMs: 5,
});

describe('coordinator core — run_next gating', () => {
  it('returns the truthful "not yet" when no adapter is registered', async () => {
    const h = use(createHarness());
    const loopId = await h.createLoop();
    const result = await h.coordinator.requestAction({ kind: 'run_next', loopId });
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/not available yet/i);
    expect((await h.loop(loopId))?.attempts).toHaveLength(0);
  });

  it('serializes concurrent run_next on one loop — exactly one attempt advances', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const adapter = fakeAdapter('background-worker', async () => {
      await gate;
      return { status: 'completed', changedFiles: ['src/a.ts'] };
    });
    const h = use(createHarness({ adapter }));
    const loopId = await h.createLoop();

    const first = h.coordinator.requestAction({ kind: 'run_next', loopId });
    const second = await h.coordinator.requestAction({ kind: 'run_next', loopId });
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/already running/i);

    release();
    const firstResult = await first;
    expect(firstResult.ok).toBe(true);
    expect((await h.loop(loopId))?.attempts).toHaveLength(1);
  });
});

describe('coordinator core — stop rules', () => {
  it('completes when required checks pass', async () => {
    const h = use(createHarness({ adapter: completes() }));
    const loopId = await h.createLoop({ checks: [{ type: 'command', command: 'ok', required: true }] });
    const result = await h.coordinator.requestAction({ kind: 'run_next', loopId });
    expect(result.ok).toBe(true);
    const loop = await h.loop(loopId);
    expect(loop?.status).toBe('complete');
    expect(loop?.attempts.at(-1)?.status).toBe('passed');
  });

  it('stops at maxAttempts when checks keep failing', async () => {
    const adapter = fakeAdapter('background-worker', async (ctx: AttemptContext) => ({
      status: 'completed' as const,
      changedFiles: [`src/file-${ctx.attempt.attemptNumber}.ts`], // distinct → not no-progress
    }));
    const h = use(createHarness({ adapter, verify: failVerify }));
    const loopId = await h.createLoop({
      checks: [failCheck],
      stopRule: { maxAttempts: 2, requireAllChecks: true, stopOnNoProgressAttempts: 5 },
    });

    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    expect((await h.loop(loopId))?.status).toBe('active');
    await h.coordinator.requestAction({ kind: 'run_next', loopId });

    const loop = await h.loop(loopId);
    expect(loop?.status).toBe('stopped');
    expect(loop?.attempts).toHaveLength(2);
    expect(loop?.statusReason).toMatch(/maximum number of attempts/i);
  });

  it('blocks on no-progress, then a single override runs one more attempt', async () => {
    const adapter = fakeAdapter('background-worker', async () => ({
      status: 'completed' as const,
      changedFiles: ['src/same.ts'],
      diffFingerprint: 'fp-const',
    }));
    const h = use(createHarness({ adapter, verify: failVerify }));
    const loopId = await h.createLoop({
      checks: [failCheck],
      stopRule: {
        maxAttempts: 10,
        requireAllChecks: true,
        stopOnNoProgressAttempts: 2,
        noProgressPolicy: {
          compareFailedChecks: true,
          compareDiffFingerprint: true,
          compareChangedFiles: true,
        },
      },
    });

    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    let loop = await h.loop(loopId);
    expect(loop?.status).toBe('blocked');
    expect(loop?.blockedReason).toBe('no-progress');

    const denied = await h.coordinator.requestAction({ kind: 'run_next', loopId });
    expect(denied.ok).toBe(false);
    expect(denied.error).toMatch(/override no-progress/i);

    const overridden = await h.coordinator.requestAction({
      kind: 'run_next',
      loopId,
      overrideNoProgress: true,
    });
    expect(overridden.ok).toBe(true);
    loop = await h.loop(loopId);
    expect(loop?.status).toBe('active');
    expect(loop?.attempts.at(-1)?.noProgressOverride).toBe(true);
    expect(loop?.attempts).toHaveLength(3);
  });
});

describe('coordinator core — budgets (D-17)', () => {
  it('blocks on a cumulative wall-clock budget, and resumes only once raised', async () => {
    const clock = makeClock();
    // Distinct files keep the loop progressing (no no-progress); the failing
    // check means the attempt would otherwise retry — so the budget is what stops it.
    const adapter = fakeAdapter('background-worker', async (ctx: AttemptContext) => {
      clock.advance(2_000); // attempt "takes" 2s
      return { status: 'completed' as const, changedFiles: [`src/file-${ctx.attempt.attemptNumber}.ts`] };
    });
    const h = use(createHarness({ adapter, clock: clock.clock, verify: failVerify }));
    const loopId = await h.createLoop({
      checks: [failCheck],
      stopRule: { maxAttempts: 10, requireAllChecks: true, stopOnNoProgressAttempts: 9 },
      budget: { maxWallClockMs: 1_000 },
    });

    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    let loop = await h.loop(loopId);
    expect(loop?.status).toBe('blocked');
    expect(loop?.blockedReason).toBe('budget-exhausted');
    expect(loop?.attempts).toHaveLength(1);

    // Resume without raising the budget → re-blocks pre-attempt, no new attempt.
    await h.coordinator.requestAction({ kind: 'resume', loopId });
    const reblocked = await h.coordinator.requestAction({ kind: 'run_next', loopId });
    expect(reblocked.message).toMatch(/budget is exhausted/i);
    expect((await h.loop(loopId))?.attempts).toHaveLength(1);

    // Raise the budget, resume, run → a fresh attempt proceeds.
    await h.patchLoop(loopId, (l) => {
      l.budget = { maxWallClockMs: 1_000_000 };
      l.status = 'active';
      l.blockedReason = undefined;
    });
    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    loop = await h.loop(loopId);
    expect(loop?.attempts).toHaveLength(2);
    expect(loop?.status).toBe('active');
  });

  it('blocks for review when an attempt exceeds maxChangedFiles, keeping the changes', async () => {
    const adapter = completes(['a.ts', 'b.ts', 'c.ts']);
    const h = use(createHarness({ adapter }));
    const loopId = await h.createLoop({
      checks: [{ type: 'command', command: 'ok', required: true }],
      budget: { maxChangedFiles: 1 },
    });

    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    const loop = await h.loop(loopId);
    expect(loop?.status).toBe('blocked');
    expect(loop?.blockedReason).toBe('changed-files-exceeded');
    const attempt = loop?.attempts.at(-1);
    expect(attempt?.status).toBe('blocked');
    expect(attempt?.changedFiles).toHaveLength(3); // kept, not rolled back
    expect(attempt?.checkResults).toHaveLength(0); // checks skipped — blocked first
  });
});

describe('coordinator core — cancellation (D-11)', () => {
  it('stop aborts an in-flight attempt and records it cancelled', async () => {
    const adapter = fakeAdapter('background-worker', async (ctx: AttemptContext) => {
      await new Promise<void>((resolve) => {
        if (ctx.signal.aborted) resolve();
        else ctx.signal.addEventListener('abort', () => resolve());
      });
      return { status: 'aborted' as const, changedFiles: [] };
    });
    const h = use(createHarness({ adapter }));
    const loopId = await h.createLoop();

    const running = h.coordinator.requestAction({ kind: 'run_next', loopId });
    await delay(5); // let the attempt start and park on the signal
    const stopped = await h.coordinator.requestAction({ kind: 'stop', loopId });
    expect(stopped.ok).toBe(true);
    await running;

    const loop = await h.loop(loopId);
    expect(loop?.status).toBe('stopped');
    expect(loop?.attempts.at(-1)?.status).toBe('cancelled');
  });
});
