/**
 * The words a row prints about running work come from observed facts only: the
 * open call, its measured wait and the last real activity. A wait with no
 * measured start has no duration, and lost contact reads Last known.
 */

import { describe, expect, it } from 'vitest';
import type { FeedbackSummary, WorkFeedback } from '@sero-ai/common';
import type { RoomSummary } from '../../shared/room-types';
import type { LoopSummary } from '../../shared/types';
import { loopActivity, loopFacts } from '../lib/loop-activity';
import { quietNow, waitLine } from '../lib/live-facts';
import { roomActivity } from '../lib/room-activity';
import { attemptLine } from '../lib/step-live';

const SESSION = '2026-10-03T09:00:00.000Z';
const NOW = Date.parse('2026-10-03T10:00:00.000Z');
const ago = (seconds: number): string => new Date(NOW - seconds * 1000).toISOString();

function summary(over: Partial<FeedbackSummary> & Pick<FeedbackSummary, 'current'>): FeedbackSummary {
  return { activeCount: over.current.length, lastActivityAt: ago(8), contactObservedAt: ago(1), ...over };
}

const member = (owner: string, wait: WorkFeedback['wait']): FeedbackSummary['current'][number] => ({ key: owner, owner, wait });

function room(over: Partial<RoomSummary> = {}): RoomSummary {
  return {
    id: 'room-1', title: 'Build the synth', status: 'running', memberCount: 2, activeMemberCount: 2, costUsd: 0.83, maxCostUsd: 2,
    maxWallClockMs: 30 * 60_000, activeMs: 12 * 60_000, activeSince: null, startedAt: ago(3600), updatedAt: ago(30),
    attentionCount: 0, deliveredAt: null, deliveryRef: null, ...over,
  } as RoomSummary;
}

function loop(over: Partial<LoopSummary> = {}): LoopSummary {
  return {
    id: 'loop-1', title: 'Check sound', status: 'active', summary: '', prompt: '', createdAt: ago(9000), updatedAt: ago(100),
    progress: { total: 4, done: 1, running: true }, activeStepTitles: ['Sweep the filter'], ...over,
  };
}

describe('an open call in words', () => {
  it('names a request with its measured wait and shows no duration when none was measured', () => {
    expect(waitLine({ kind: 'request', since: ago(47) }, NOW)).toBe('waiting for the model · 0:47');
    const unmeasured = waitLine({ kind: 'request', since: null }, NOW);
    expect(unmeasured).toBe('waiting for the model');
    expect(unmeasured).not.toContain('0:');
  });

  it('names a tool, and does not invent a name for one the source did not name', () => {
    expect(waitLine({ kind: 'tool', toolName: 'bash', since: ago(12) }, NOW)).toBe('bash · 0:12');
    expect(waitLine({ kind: 'tool', toolName: null, since: null }, NOW)).toBe('running a tool');
    expect(waitLine(null, NOW)).toBeNull();
  });

  it('keeps a running step\'s line still, and names a call only once it has lasted', () => {
    const at = (wait: WorkFeedback['wait'], last: number) => ({ epoch: 'e1', attached: true, terminal: null, wait, lastActivityAt: ago(last), contactObservedAt: ago(1) }) as WorkFeedback;
    // Short requests and tools change several times a second. The line does not follow them.
    expect(attemptLine(at({ kind: 'request', since: ago(1) }, 1), 'e1', NOW)).toBe('Working');
    expect(attemptLine(at({ kind: 'tool', toolName: 'read', since: ago(0) }, 2), 'e1', NOW)).toBe('Working');
    expect(attemptLine(at(null, 3), 'e1', NOW)).toBe('Working');
    // A call that stays open is the fact a reader needs.
    expect(attemptLine(at({ kind: 'tool', toolName: 'bash', since: ago(45) }, 45), 'e1', NOW)).toBe('bash · 0:45 · Last activity 45s ago');
    expect(attemptLine(at({ kind: 'request', since: ago(20) }, 2), 'e1', NOW)).toBe('waiting for the model · 0:20');
  });

  it('calls a request quiet only while no text arrived, and says nothing for work that is not attached', () => {
    const feedback = { epoch: 'e1', attached: true, terminal: null, wait: { kind: 'request', since: ago(5) } } as WorkFeedback;
    expect(quietNow(feedback, 'e1', false, NOW)?.what).toBe('waiting for the model');
    expect(quietNow(feedback, 'e1', true, NOW)).toBeNull();
    expect(quietNow({ ...feedback, attached: false }, 'e1', false, NOW)).toBeNull();
    expect(quietNow(feedback, 'e2', false, NOW)).toBeNull();
    expect(quietNow(undefined, 'e1', false, NOW)).toBeNull();
  });
});

describe('a Room row', () => {
  it('counts concurrent members instead of naming the last one to report', () => {
    const work = summary({ current: [member('Adversary', null), member('Conductor', null)] });

    const activity = roomActivity(room(), SESSION, work, NOW);

    expect(activity.line).toBe('Working · 2 members working');
    expect(activity.facts).toBe('12 min of 30 min active · Last activity 8s ago');
  });

  it('names the one member and its wait, with a duration only when it was measured', () => {
    const tool = roomActivity(room(), SESSION, summary({ current: [member('Adversary', { kind: 'tool', toolName: 'bash', since: null })] }), NOW);
    expect(tool.line).toBe('Working · Adversary · bash');

    const measured = roomActivity(room(), SESSION, summary({ current: [member('Adversary', { kind: 'request', since: ago(47) })] }), NOW);
    expect(measured.line).toBe('Working · Adversary · waiting for the model · 0:47');

    const unmeasured = roomActivity(room(), SESSION, summary({ current: [member('Adversary', { kind: 'request', since: null })] }), NOW);
    expect(unmeasured.line).toBe('Working · Adversary · waiting for the model');
  });

  it('reads a saved running Room with no confirmed contact as Last known, without calling it failed', () => {
    const activity = roomActivity(room(), SESSION, undefined, NOW);

    expect(activity.line).toBe('Last known · 2 members');
    expect(activity.facts).toBe('12 min of 30 min active · cannot be confirmed');
    expect(activity.state).toBe('last-known');
  });

  it('keeps the last real activity beside the loss of contact', () => {
    const lost = summary({ activeCount: 0, current: [], lastActivityAt: ago(120) });

    const activity = roomActivity(room(), SESSION, lost, NOW);

    expect(activity.state).toBe('last-known');
    expect(activity.facts).toContain('Last activity');
    expect(activity.facts).toContain('cannot be confirmed');
  });

  it('says a pausing Room has turns still finishing', () => {
    const activity = roomActivity(room({ status: 'pausing' }), SESSION, summary({ current: [member('A', null), member('B', null)] }), NOW);

    expect(activity.line).toBe('Pausing · 2 turns are still finishing');
  });

  it('says a Room stopped at its time limit, and that it needs a larger total', () => {
    const stopped = room({
      status: 'paused', activeMs: 30 * 60_000, attentionCount: 1,
      attention: { approvals: [], pause: { kind: 'limit-reached', detail: 'Time limit reached.', at: ago(60) } },
    });

    const activity = roomActivity(stopped, SESSION, undefined, NOW);

    expect(activity.line).toBe('Stopped · reached its 30 min time limit');
    expect(activity.timeLimit).toBe(true);
  });

  it('does not call a cost limit a time limit', () => {
    const stopped = room({
      status: 'paused', activeMs: 5 * 60_000, attentionCount: 1,
      attention: { approvals: [], pause: { kind: 'limit-reached', detail: 'Cost limit reached.', at: ago(60) } },
    });

    expect(roomActivity(stopped, SESSION, undefined, NOW).timeLimit).toBe(false);
  });

  it('reads a finished Room as complete and keeps the time it used', () => {
    const activity = roomActivity(room({ status: 'completed', activeMs: 24 * 60_000 }), SESSION, undefined, NOW);

    expect(activity.state).toBe('complete');
    expect(activity.facts).toBe('24 min of 30 min active');
  });
});

describe('a Workflow row', () => {
  it('names the step, then the observed wait and its measured duration', () => {
    const work = summary({ current: [{ key: 'attempt:a1', owner: 'agent', subject: 'Sweep the filter', wait: { kind: 'request', since: ago(47) } }] });

    const activity = loopActivity(loop(), SESSION, work, NOW);

    expect(activity.line).toBe('Working · Step 2 of 4 · waiting for the model · 0:47');
    expect(activity.freshness).toBe('Last activity 8s ago');
    expect(loopFacts(activity, 'Last ran 2d ago · 4 steps')).toBe('Last activity 8s ago');
  });

  it('gives no duration for a wait whose start the source did not report', () => {
    const work = summary({ current: [{ key: 'attempt:a1', owner: 'agent', wait: { kind: 'tool', toolName: null, since: null } }] });

    const activity = loopActivity(loop(), SESSION, work, NOW);

    expect(activity.line).toBe('Working · Step 2 of 4 · running a tool');
  });

  it('counts parallel steps', () => {
    const work = summary({ current: [{ key: 'a', owner: 'x', wait: null }, { key: 'b', owner: 'y', wait: null }] });

    expect(loopActivity(loop(), SESSION, work, NOW).line).toBe('Working · 2 steps working');
  });

  it('reads lost contact as Last known and says it cannot be confirmed', () => {
    const lost = summary({ activeCount: 0, current: [], lastActivityAt: ago(120) });

    const activity = loopActivity(loop({ lastRunAt: ago(500) }), SESSION, lost, NOW);

    expect(activity.state).toBe('last-known');
    expect(loopFacts(activity, 'Last ran 8m ago')).toContain('cannot be confirmed');
  });
});
