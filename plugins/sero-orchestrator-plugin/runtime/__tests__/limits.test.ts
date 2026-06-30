import { describe, expect, it } from 'vitest';
import { checkManagementLimits } from '../limits';
import type { Loop, LoopRun } from '../../shared/types';
import { createFakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';

const NOW = Date.parse('2026-01-01T00:10:00.000Z');

function runStartedAt(iso: string): LoopRun {
  return { id: 'r', runNumber: 1, status: 'running', startedStepIds: [], stepAttempts: [], recoveryDecisions: [], observations: [], startedAt: iso };
}

function withAttempts(loop: Loop, attempts: number): Loop {
  return { ...loop, runtime: { ...loop.runtime, stepStates: { 'step-1': { status: 'pending', attempts, updatedAt: 't' } } } };
}

describe('checkManagementLimits', () => {
  it('passes when under all limits', () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    expect(checkManagementLimits(loop, runStartedAt('2026-01-01T00:09:00.000Z'), NOW).ok).toBe(true);
  });

  it('blocks on max total attempts', () => {
    const host = createFakeHost();
    const loop = withAttempts({ ...seedActiveLoop(host, oneStepPlan().plan), limits: { maxAttemptsTotal: 3 } }, 3);
    const check = checkManagementLimits(loop, runStartedAt('2026-01-01T00:09:00.000Z'), NOW);
    expect(check.ok).toBe(false);
    expect(check.limit).toBe('maxAttemptsTotal');
  });

  it('blocks on wall-clock', () => {
    const host = createFakeHost();
    const loop = { ...seedActiveLoop(host, oneStepPlan().plan), limits: { maxWallClockMs: 60_000 } };
    const check = checkManagementLimits(loop, runStartedAt('2026-01-01T00:00:00.000Z'), NOW);
    expect(check.ok).toBe(false);
    expect(check.limit).toBe('maxWallClockMs');
  });

  it('blocks on total tokens', () => {
    const host = createFakeHost();
    const base = seedActiveLoop(host, oneStepPlan().plan);
    const loop: Loop = {
      ...base,
      limits: { maxTotalTokens: 100 },
      runs: [{ ...runStartedAt('t'), stepAttempts: [{ id: 'a', stepId: 'step-1', attemptNumber: 1, parentSessionId: 'p', executionType: 'model', status: 'completed', observations: [], startedAt: 't', usage: { totalTokens: 150 } }] }],
    };
    const check = checkManagementLimits(loop, runStartedAt('2026-01-01T00:09:00.000Z'), NOW);
    expect(check.ok).toBe(false);
    expect(check.limit).toBe('maxTotalTokens');
  });
});
