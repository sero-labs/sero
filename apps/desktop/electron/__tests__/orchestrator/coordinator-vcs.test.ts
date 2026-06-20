import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type {
  AttemptContext,
  AttemptExecutionResult,
} from '@plugins/sero-orchestrator-plugin/runtime/adapter';
import type { DirtyRootGate } from '@plugins/sero-orchestrator-plugin/runtime/vcs';

import { createHarness, fakeAdapter, type Harness } from './harness';

function completes(changedFiles: string[] = ['src/a.ts']) {
  return fakeAdapter('background-worker', async (): Promise<AttemptExecutionResult> => ({
    status: 'completed',
    changedFiles,
  }));
}

function gateReturning(choice: 'auto-save' | 'defer' | 'timeout'): DirtyRootGate {
  return { prompt: async () => choice };
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

describe('coordinator core — baseRef + dirty-root gate (D-07)', () => {
  it('records a clean baseRef = HEAD and no dirty decision', async () => {
    const h = use(createHarness({ adapter: completes(), head: 'CLEANHEAD', dirty: false }));
    const loopId = await h.createLoop({ checks: [{ type: 'command', command: 'ok', required: true }] });
    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    const attempt = (await h.loop(loopId))?.attempts.at(-1);
    expect(attempt?.baseRef).toBe('CLEANHEAD');
    expect(attempt?.dirtyRootDecision).toBeUndefined();
  });

  it('auto-saves a dirty root as the baseline before mutating', async () => {
    const h = use(
      createHarness({
        adapter: completes(),
        dirty: true,
        checkpoint: 'BASELINESHA',
        gate: gateReturning('auto-save'),
      }),
    );
    const loopId = await h.createLoop({ checks: [{ type: 'command', command: 'ok', required: true }] });
    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    const attempt = (await h.loop(loopId))?.attempts.at(-1);
    expect(attempt?.baseRef).toBe('BASELINESHA');
    expect(attempt?.dirtyRootDecision).toBe('auto-save');
  });

  it('auto-saves when the dirty-root prompt times out', async () => {
    const h = use(
      createHarness({ adapter: completes(), dirty: true, checkpoint: 'TIMEOUTSHA', gate: gateReturning('timeout') }),
    );
    const loopId = await h.createLoop({ checks: [{ type: 'command', command: 'ok', required: true }] });
    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    const attempt = (await h.loop(loopId))?.attempts.at(-1);
    expect(attempt?.dirtyRootDecision).toBe('auto-save-timeout');
  });

  it('defers without starting an attempt when the user chooses defer', async () => {
    const h = use(createHarness({ adapter: completes(), dirty: true, gate: gateReturning('defer') }));
    const loopId = await h.createLoop();
    const result = await h.coordinator.requestAction({ kind: 'run_next', loopId });
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/deferred/i);
    const loop = await h.loop(loopId);
    expect(loop?.attempts).toHaveLength(0);
    expect(loop?.status).toBe('active');
    expect(loop?.statusReason).toMatch(/unsaved changes/i);
  });
});

describe('coordinator core — check normalization (D-12)', () => {
  it('normalizes verification and command checks to the same shape', async () => {
    const verify = (command: string) => ({
      command,
      success: command !== 'fails',
      stdout: '',
      stderr: command === 'fails' ? 'nope' : '',
      durationMs: 7,
    });
    const h = use(createHarness({ adapter: completes(), verify }));
    const loopId = await h.createLoop({
      checks: [
        { type: 'verification', command: 'passes', required: false },
        { type: 'command', command: 'fails', required: false },
      ],
    });
    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    const results = (await h.loop(loopId))?.attempts.at(-1)?.checkResults ?? [];
    expect(results).toHaveLength(2);
    const [passed, failed] = results;
    expect(passed?.type).toBe('verification');
    expect(passed?.status).toBe('passed');
    expect(failed?.type).toBe('command');
    expect(failed?.status).toBe('failed');
    // Identical structural keys regardless of backend.
    expect(Object.keys(passed!).sort()).toEqual(Object.keys(failed!).sort());
    expect(failed?.summary).toMatch(/Check failed/);
  });

  it('reports review checks as skipped until Phase 3', async () => {
    const h = use(createHarness({ adapter: completes() }));
    const loopId = await h.createLoop({
      checks: [{ type: 'review', reviewer: 'quality-reviewer', required: false }],
    });
    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    const result = (await h.loop(loopId))?.attempts.at(-1)?.checkResults.at(0);
    expect(result?.status).toBe('skipped');
  });
});

describe('coordinator core — artifacts + retention (D-14)', () => {
  it('writes oversized check output to an artifact referenced by path', async () => {
    const big = 'E'.repeat(5_000);
    const verify = (command: string) => ({
      command,
      success: false,
      stdout: '',
      stderr: big,
      durationMs: 5,
    });
    const h = use(createHarness({ adapter: completes(), verify }));
    const loopId = await h.createLoop({
      checks: [{ type: 'command', command: 'noisy', required: false }],
      logPolicy: { retainAttempts: 20, retainArtifacts: true, maxInlineOutputBytes: 10 },
    });
    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    const result = (await h.loop(loopId))?.attempts.at(-1)?.checkResults.at(0);
    expect(result?.stderrPath).toBeDefined();
    expect(h.readArtifact(result!.stderrPath!)).toBe(big);
  });

  it('prunes attempts past retainAttempts and deletes their artifacts', async () => {
    const big = 'X'.repeat(5_000);
    const verify = (command: string) => ({ command, success: false, stdout: big, stderr: '', durationMs: 5 });
    const adapter = fakeAdapter('background-worker', async (ctx: AttemptContext) => ({
      status: 'completed' as const,
      changedFiles: [`src/file-${ctx.attempt.attemptNumber}.ts`], // distinct → keeps progressing
    }));
    const h = use(createHarness({ adapter, verify }));
    const loopId = await h.createLoop({
      checks: [{ type: 'command', command: 'noisy', required: true }],
      stopRule: { maxAttempts: 10, requireAllChecks: true, stopOnNoProgressAttempts: 9 },
      logPolicy: { retainAttempts: 2, retainArtifacts: false, maxInlineOutputBytes: 10 },
    });

    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    const firstAttemptId = (await h.loop(loopId))?.attempts.at(0)?.id;
    expect(firstAttemptId).toBeDefined();
    expect(existsSync(join(h.artifactRoot, firstAttemptId!))).toBe(true);

    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    await h.coordinator.requestAction({ kind: 'run_next', loopId });

    const loop = await h.loop(loopId);
    expect(loop?.attempts).toHaveLength(2);
    expect(loop?.attempts.some((a) => a.id === firstAttemptId)).toBe(false);
    expect(existsSync(join(h.artifactRoot, firstAttemptId!))).toBe(false);
  });
});
