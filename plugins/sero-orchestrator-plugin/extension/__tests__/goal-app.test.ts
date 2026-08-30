import { describe, expect, it } from 'vitest';
import type { GoalRuntime } from '../../runtime/goals/goal-runtime';
import type { Goal } from '../../shared/goal-types';
import { executeGoalApp } from '../goal-app';

const goal: Goal = {
  schemaVersion: 1,
  id: 'goal-1',
  workspaceId: 'ws-1',
  sessionPath: '/sessions/release.jsonl',
  sessionId: 'session-1',
  objective: 'Make the build green',
  criteria: ['pnpm build exits zero'],
  status: 'limited',
  limits: { maxAttemptsTotal: 25 },
  usage: { automaticTurns: 25, totalTokens: 10_000, costUsd: 0.2, activeMs: 60_000 },
  progress: { repeats: 0 },
  limitReached: 'maxAttemptsTotal',
  history: [],
  createdAt: '2026-08-30T10:00:00Z',
  updatedAt: '2026-08-30T10:10:00Z',
};

function stubRuntime() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const outcome = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
    return Promise.resolve({ ok: true, text: method, goal });
  };
  const runtime = {
    list: () => Promise.resolve([goal]),
    pause: outcome('pause'),
    resume: outcome('resume'),
    stop: outcome('stop'),
    setLimits: outcome('setLimits'),
  } as unknown as GoalRuntime;
  return { runtime, calls };
}

describe('the Goals management tool', () => {
  it('reads one Goal and returns its full detail record', async () => {
    const { runtime } = stubRuntime();
    const result = await executeGoalApp({ action: 'show', goalId: 'goal-1' }, '/repo', () => runtime);
    expect(result.details.goal).toEqual(goal);
  });

  it('passes pause, resume, and stop to the existing Goal runtime', async () => {
    const { runtime, calls } = stubRuntime();
    await executeGoalApp({ action: 'pause', goalId: 'goal-1' }, '/repo', () => runtime);
    await executeGoalApp({ action: 'resume', goalId: 'goal-1' }, '/repo', () => runtime);
    await executeGoalApp({ action: 'stop', goalId: 'goal-1' }, '/repo', () => runtime);
    expect(calls).toEqual([
      { method: 'pause', args: ['goal-1', 'user', 'the user paused the goal in Orchestrator'] },
      { method: 'resume', args: ['goal-1'] },
      { method: 'stop', args: ['goal-1'] },
    ]);
  });

  it('maps all four user-facing budgets to the runtime limit shape', async () => {
    const { runtime, calls } = stubRuntime();
    await executeGoalApp({
      action: 'set_limits',
      goalId: 'goal-1',
      maxTurns: 50,
      maxMinutes: 90,
      maxTokens: 400_000,
      maxCostUsd: 5,
    }, '/repo', () => runtime);
    expect(calls[0]).toEqual({
      method: 'setLimits',
      args: ['goal-1', { maxAttemptsTotal: 50, maxWallClockMs: 5_400_000, maxTotalTokens: 400_000, maxCostUsd: 5 }],
    });
  });
});
