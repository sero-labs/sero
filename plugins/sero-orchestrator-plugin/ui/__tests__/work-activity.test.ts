/**
 * A list row reads observed work from bounded metadata. It needs no Room or
 * Workflow record beyond the index row, and no output watch.
 */

import { describe, expect, it } from 'vitest';
import type { WorkFeedback } from '@sero-ai/common';
import type { RoomSummary } from '../../shared/room-types';
import type { LoopSummary } from '../../shared/types';
import { loopActivity } from '../lib/loop-activity';
import { roomActivity } from '../lib/room-activity';
import { feedbackByWork } from '../lib/use-work-activity';

const EPOCH = '2026-10-03T09:00:00.000Z';
const AT = '2026-10-03T10:00:00.000Z';

function feedback(key: string, workId: string, over: Partial<WorkFeedback> = {}): WorkFeedback {
  return {
    key, kind: 'room-member', owner: key, scope: { appId: 'orchestrator', workspaceId: 'ws-1', workId },
    epoch: EPOCH, revision: 1, turnId: 't1', attached: true, wait: { kind: 'request', since: AT }, openCalls: 1,
    lastActivityAt: AT, contactObservedAt: AT, terminal: null, ...over,
  };
}

const room = (id: string): RoomSummary => ({
  id, title: 'Validation', status: 'running', memberCount: 2, activeMemberCount: 0, costUsd: 0, maxCostUsd: 2,
  startedAt: AT, updatedAt: AT, problemStatement: '', members: [], attentionCount: 0, deliveredAt: null, deliveryRef: null,
} as unknown as RoomSummary);

describe('list rows from work feedback', () => {
  it('reads a Room as working when a member holds a quiet request, with no live mark on the row', () => {
    const work = feedbackByWork([feedback('m1', 'room-1'), feedback('m2', 'room-1', { wait: { kind: 'tool', toolName: 'bash', since: AT } })], EPOCH);
    expect(roomActivity(room('room-1'), EPOCH).state).toBe('last-known');
    expect(roomActivity(room('room-1'), EPOCH, work.get('room-1')).state).toBe('working');
    // Two members at work are counted as two.
    expect(work.get('room-1')?.activeCount).toBe(2);
  });

  it('keeps another Room in the same workspace out of it', () => {
    const work = feedbackByWork([feedback('m1', 'room-1')], EPOCH);
    expect(work.has('room-2')).toBe(false);
    expect(roomActivity(room('room-2'), EPOCH, work.get('room-2')).state).toBe('last-known');
  });

  it('goes back to last known when the member is lost, and never to working from an old session', () => {
    const lost = feedbackByWork([feedback('m1', 'room-1', { attached: false, wait: null })], EPOCH);
    expect(roomActivity(room('room-1'), EPOCH, lost.get('room-1')).state).toBe('last-known');
    const stale = feedbackByWork([feedback('m1', 'room-1', { epoch: '2026-10-02T09:00:00.000Z' })], EPOCH);
    expect(roomActivity(room('room-1'), EPOCH, stale.get('room-1')).state).toBe('last-known');
  });

  it('reads a Workflow as working from a step attempt that reports', () => {
    const loop = { id: 'loop-1', title: 'Build', status: 'active', progress: { done: 0, total: 2, running: 1 } } as unknown as LoopSummary;
    const work = feedbackByWork([feedback('attempt:a1', 'loop-1', { kind: 'workflow-attempt' })], EPOCH);
    expect(loopActivity(loop, EPOCH, work.get('loop-1')).state).toBe('working');
  });
});
