/**
 * Observable waits on the project record (spec durable-agent-waits).
 */

import { describe, expect, it } from 'vitest';
import { block, pause } from '../lifecycle';
import { createProjectRecord, type Milestone, type ProjectRecord } from '../record';
import {
  cancelWait,
  consumeWake,
  expireDueWaits,
  observeWait,
  registerWait,
  reservedWakes,
  reserveWake,
  stopWaits,
  unreservedMatches,
  type WaitRegistration,
} from '../waits';

const T0 = '2026-10-06T09:00:00.000Z';
const T1 = '2026-10-06T09:30:00.000Z';

const milestone = (): Milestone => ({
  id: 'm1', title: 'Fix the pager', status: 'running', plan: null, preview: null, dispatch: null,
  evidence: null, verification: null, parkedBy: null, parkedFrom: null, receipt: null,
});

const project = (): ProjectRecord => ({
  ...createProjectRecord({ id: 'p1', name: 'Pager', idea: 'Fix the pager', folder: '/tmp/pager', capUsd: 5, now: T0 }),
  milestones: [milestone()],
  // The user approved the start, so the owner may be woken.
  agreement: { revision: 1, capUsd: 5, proposedAt: T0, approvedAt: T0, authority: { policyId: 'p', workspaceId: 'ws', roles: {}, maxLiveSessions: 1, maxTotalSessions: 1 } },
});

const request = (overrides: Partial<Parameters<typeof registerWait>[1]> = {}) => ({
  id: 'wait-1', now: T0, source: { kind: 'child', id: 'loop_1' }, owner: { milestoneId: 'm1', executionId: null }, ...overrides,
});

function registered(record = project(), overrides = {}): { record: ProjectRecord; wait: WaitRegistration } {
  const result = registerWait(record, request(overrides));
  if (!result.ok) throw new Error(result.reason);
  return { record: result.record, wait: result.wait };
}

describe('wait registration', () => {
  it('leaves a record saved before waits existed unchanged and adds a wait only when asked', () => {
    const legacy = project();
    expect(legacy.waits).toBeUndefined();
    expect(expireDueWaits(legacy, T1)).toBe(legacy);
    expect(reservedWakes(legacy)).toEqual([]);
    expect(registered(legacy).record.waits).toHaveLength(1);
  });

  it('keeps the source identity and owner, and the same open wait is not registered twice', () => {
    const { record, wait } = registered(project(), { owner: { milestoneId: 'm1', executionId: 'exec-1' } });
    expect(wait).toMatchObject({ source: { kind: 'child', id: 'loop_1' }, condition: 'completed', owner: { milestoneId: 'm1', executionId: 'exec-1' }, outcome: null, wake: null });
    const again = registerWait(record, request({ id: 'wait-2', owner: { milestoneId: 'm1', executionId: 'exec-1' } }));
    expect(again).toMatchObject({ ok: true, created: false });
    expect(again.ok && again.record.waits).toHaveLength(1);
  });

  it('refuses a source the runtime cannot monitor and says manual resume is required', () => {
    for (const kind of ['process', 'ci', 'whenever the build looks green']) {
      const result = registerWait(project(), request({ source: { kind, id: 'x' } }));
      expect(result).toMatchObject({ ok: false });
      expect(!result.ok && result.reason).toMatch(/cannot monitor.*Manual resume is required/);
    }
    // The record side holds a process wait once a runtime can observe one.
    expect(registerWait(project(), request({ source: { kind: 'process', id: 'pid-7' } }), ['child', 'process']).ok).toBe(true);
  });
});

describe('observing a wait', () => {
  it('records one outcome: a duplicate or late observation changes nothing', () => {
    const { record } = registered();
    const first = observeWait(record, 'wait-1', 'satisfied', T1);
    expect(first.waits?.[0].outcome).toMatchObject({ kind: 'satisfied', at: T1 });
    expect(observeWait(first, 'wait-1', 'satisfied', T1)).toBe(first);
    expect(observeWait(first, 'wait-1', 'failed', '2026-10-06T10:00:00.000Z')).toBe(first);
    expect(cancelWait(first, 'wait-1', T1)).toBe(first);
  });

  it('ends an unmet wait as expired at its deadline, and not before', () => {
    const { record } = registered(project(), { deadlineMinutes: 10 });
    expect(record.waits?.[0].deadline).toBe('2026-10-06T09:10:00.000Z');
    expect(expireDueWaits(record, '2026-10-06T09:09:00.000Z')).toBe(record);
    expect(expireDueWaits(record, T1).waits?.[0].outcome).toMatchObject({ kind: 'expired' });
    // A wait that was satisfied first is not expired afterwards.
    const satisfied = observeWait(record, 'wait-1', 'satisfied', '2026-10-06T09:05:00.000Z');
    expect(expireDueWaits(satisfied, T1)).toBe(satisfied);
  });
});

describe('reserving and consuming a wake', () => {
  const ended = () => observeWait(registered().record, 'wait-1', 'satisfied', T1);

  it('gives one wake per wait, and consuming it twice does nothing', () => {
    const reserved = reserveWake(ended(), 'wait-1', T1);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    expect(reserveWake(reserved.record, 'wait-1', T1)).toMatchObject({ ok: false });
    expect(reservedWakes(reserved.record)).toHaveLength(1);
    const consumed = consumeWake(reserved.record, 'wait-1', T1);
    expect(consumed.ok).toBe(true);
    if (!consumed.ok) return;
    expect(reservedWakes(consumed.record)).toHaveLength(0);
    expect(consumeWake(consumed.record, 'wait-1', T1)).toMatchObject({ ok: false });
  });

  it('refuses a wake once the agreement authority is revoked', () => {
    const base = ended();
    const revoked = { ...base, agreement: base.agreement && { ...base.agreement, authority: null } };
    expect(reserveWake(revoked, 'wait-1', T1)).toMatchObject({ ok: false });
  });

  it('keeps the outcome for resume while the project is paused or blocked', () => {
    const base = ended();
    const paused = pause(base, T1);
    if (!paused.ok) throw new Error(paused.error);
    expect(reserveWake(paused.record, 'wait-1', T1)).toMatchObject({ ok: false });
    expect(unreservedMatches(paused.record)).toHaveLength(1);
    const held = block(base, T1, 'a reason');
    if (!held.ok) throw new Error(held.error);
    expect(reserveWake(held.record, 'wait-1', T1)).toMatchObject({ ok: false });
  });

  it('makes a reserved wake stale when the project is stopped, and a stop cannot be revived', () => {
    const reserved = reserveWake(ended(), 'wait-1', T1);
    if (!reserved.ok) throw new Error(reserved.reason);
    const stopped = stopWaits(reserved.record, T1);
    expect(reservedWakes(stopped)).toHaveLength(0);
    expect(consumeWake(stopped, 'wait-1', T1)).toMatchObject({ ok: false });
    // An open wait is cancelled by the stop, and a late event cannot satisfy it.
    const open = stopWaits(registered().record, T1);
    expect(open.waits?.[0].outcome).toMatchObject({ kind: 'cancelled' });
    expect(observeWait(open, 'wait-1', 'satisfied', T1)).toBe(open);
    expect(reserveWake(open, 'wait-1', T1)).toMatchObject({ ok: false });
  });

  it('never wakes for a cancelled wait or one that is uncertain', () => {
    const cancelled = cancelWait(registered().record, 'wait-1', T1);
    expect(reserveWake(cancelled, 'wait-1', T1)).toMatchObject({ ok: false });
    const uncertain = observeWait(registered().record, 'wait-1', 'uncertain', T1, 'the process could not be identified');
    expect(reserveWake(uncertain, 'wait-1', T1)).toMatchObject({ ok: false });
  });
});
