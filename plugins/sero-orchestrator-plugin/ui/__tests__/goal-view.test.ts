import { describe, expect, it } from 'vitest';
import type { GoalIndexEntry } from '../../shared/goal-types';
import { attentionCount, goalNeedsAttention } from '../lib/attention-count';
import { goalDot, goalStateLabel } from '../components/GoalsOverview';

function summary(overrides: Partial<GoalIndexEntry> = {}): GoalIndexEntry {
  return {
    id: 'goal-1',
    objective: 'Make the build green',
    status: 'active',
    sessionPath: '/sessions/release.jsonl',
    sessionId: 'session-1',
    automaticTurns: 4,
    maxAutomaticTurns: 25,
    costUsd: 0.2,
    updatedAt: '2026-08-30T10:00:00Z',
    ...overrides,
  };
}

describe('Goal list presentation', () => {
  it('keeps reported completion, stopped, limited, and no-progress wording distinct', () => {
    expect(goalStateLabel(summary({ status: 'complete' }))).toBe('Reported complete');
    expect(goalStateLabel(summary({ status: 'paused', closedAt: '2026-08-30T11:00:00Z' }))).toBe('Stopped');
    expect(goalStateLabel(summary({ status: 'limited' }))).toBe('Limited');
    expect(goalStateLabel(summary({ status: 'paused', pauseReason: 'no-progress' }))).toBe('Held for no progress');
    expect(goalDot(summary({ status: 'limited' }))).toBe('blocked');
  });
});

describe('Goal Needs You integration', () => {
  it('includes blocked, waiting, and no-progress holds, but not ordinary pauses', () => {
    const goals = [
      summary({ id: 'blocked', status: 'blocked' }),
      summary({ id: 'waiting', status: 'waiting' }),
      summary({ id: 'held', status: 'paused', pauseReason: 'no-progress' }),
      summary({ id: 'paused', status: 'paused', pauseReason: 'user' }),
    ];
    expect(goals.map(goalNeedsAttention)).toEqual([true, true, true, false]);
    expect(attentionCount([], [], goals)).toBe(3);
  });

  it('does not keep a stopped Goal in Needs You', () => {
    expect(goalNeedsAttention(summary({ status: 'blocked', closedAt: '2026-08-30T11:00:00Z' }))).toBe(false);
  });
});
