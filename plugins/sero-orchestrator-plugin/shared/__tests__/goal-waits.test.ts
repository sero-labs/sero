/**
 * Observable waits on the Goal record (spec durable-agent-waits).
 */

import { describe, expect, it } from 'vitest';
import type { Goal } from '../goal-types';
import {
  expireDueWaits,
  observeWait,
  registerWait,
  reservedWakes,
  reserveWake,
  stopWaits,
  supersedeWaits,
  unreservedMatches,
} from '../goal-waits';

const T0 = '2026-10-06T09:00:00.000Z';
const T1 = '2026-10-06T09:30:00.000Z';

const goal = (overrides: Partial<Goal> = {}): Goal => ({
  schemaVersion: 1, id: 'goal-1', workspaceId: 'ws', sessionPath: '/s.jsonl', sessionId: null, objective: 'ship', criteria: [],
  status: 'waiting', limits: {}, usage: { automaticTurns: 0, totalTokens: 0, costUsd: 0, activeMs: 0 }, progress: { repeats: 0 },
  history: [], createdAt: T0, updatedAt: T0, ...overrides,
});

const request = (overrides = {}) => ({ id: 'wait-1', now: T0, source: { kind: 'child', id: 'loop-1' }, ...overrides });

function registered(base = goal(), overrides = {}): Goal {
  const result = registerWait(base, request(overrides));
  if (!result.ok) throw new Error(result.reason);
  return result.goal;
}

describe('goal wait registration', () => {
  it('loads an older goal unchanged and keeps its reason-only wait manual', () => {
    const legacy = goal({ wait: { reason: 'for the build' } });
    expect(legacy.waits).toBeUndefined();
    expect(expireDueWaits(legacy, T1)).toBe(legacy);
    expect(unreservedMatches(legacy)).toEqual([]);
    expect(registered(legacy).wait).toEqual({ reason: 'for the build' });
  });

  it('keeps the source identity, and refuses what the runtime cannot monitor', () => {
    expect(registered().waits?.[0]).toMatchObject({ owner: { goalId: 'goal-1' }, source: { kind: 'child', id: 'loop-1' }, condition: 'completed', outcome: null, wake: null });
    for (const kind of ['process', 'ci', 'until it feels done']) {
      const result = registerWait(goal(), request({ source: { kind, id: 'x' } }));
      expect(!result.ok && result.reason).toMatch(/cannot monitor.*Manual resume is required/);
    }
  });

  it('records one outcome, expires at its deadline, and a duplicate changes nothing', () => {
    const waiting = registered(goal(), { deadlineMinutes: 10 });
    const first = observeWait(waiting, 'wait-1', 'satisfied', T0);
    expect(observeWait(first, 'wait-1', 'failed', T1)).toBe(first);
    expect(expireDueWaits(first, T1)).toBe(first);
    expect(expireDueWaits(waiting, T1).waits?.[0].outcome).toMatchObject({ kind: 'expired' });
  });
});

describe('goal wakes', () => {
  const ended = () => observeWait(registered(), 'wait-1', 'satisfied', T0);

  it('reserves one wake for a waiting goal only, and keeps the outcome while paused', () => {
    const reserved = reserveWake(ended(), 'wait-1', T1);
    expect(reserved.ok && reservedWakes(reserved.goal)).toHaveLength(1);
    expect(reserved.ok && reserveWake(reserved.goal, 'wait-1', T1)).toMatchObject({ ok: false });
    for (const status of ['paused', 'blocked', 'limited', 'complete', 'active'] as const) {
      expect(reserveWake({ ...ended(), status }, 'wait-1', T1)).toMatchObject({ ok: false });
    }
    expect(unreservedMatches({ ...ended(), status: 'paused' })).toHaveLength(1);
  });

  it('a stop invalidates open and reserved waits and cannot be revived', () => {
    const reserved = reserveWake(ended(), 'wait-1', T1);
    if (!reserved.ok) throw new Error(reserved.reason);
    expect(reservedWakes(stopWaits(reserved.goal, T1))).toHaveLength(0);
    const stoppedOpen = stopWaits(registered(), T1);
    expect(stoppedOpen.waits?.[0].outcome).toMatchObject({ kind: 'cancelled' });
    expect(reserveWake(stoppedOpen, 'wait-1', T1)).toMatchObject({ ok: false });
    expect(observeWait(stoppedOpen, 'wait-1', 'satisfied', T1)).toBe(stoppedOpen);
  });

  it('a user resume cancels open waits and hands an ended one to the resumed turn once', () => {
    const resumed = supersedeWaits(ended(), T1);
    expect(reservedWakes(resumed)).toHaveLength(1);
    expect(unreservedMatches(resumed)).toHaveLength(0);
    expect(supersedeWaits(registered(), T1).waits?.[0].outcome).toMatchObject({ kind: 'cancelled' });
  });
});
