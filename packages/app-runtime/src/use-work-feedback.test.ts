import { describe, expect, it } from 'vitest';
import type { WorkFeedback } from '@sero-ai/common';
import { foldWorkFeedback, type WorkFeedbackView } from './use-work-feedback';

const EPOCH = '2026-10-03T09:00:00.000Z';
const EMPTY: WorkFeedbackView = { epoch: null, snapshots: new Map() };

function snapshot(key: string, revision: number, over: Partial<WorkFeedback> = {}): WorkFeedback {
  return {
    key, kind: 'room-member', owner: key, scope: { appId: 'orchestrator', workspaceId: 'ws-1', workId: 'room-1' },
    epoch: EPOCH, revision, turnId: 't1', attached: true, wait: null, openCalls: 0,
    lastActivityAt: null, contactObservedAt: null, terminal: null, ...over,
  };
}

describe('foldWorkFeedback', () => {
  it('keeps a pushed update that arrived before the first read returned', () => {
    // The push lands first; the reply was read before it and lands second.
    const pushed = foldWorkFeedback(EMPTY, EPOCH, [snapshot('m1', 7, { turnId: 't2' })]);
    const merged = foldWorkFeedback(pushed, EPOCH, [snapshot('m1', 3), snapshot('m2', 4)]);
    expect(merged.snapshots.get('m1')?.turnId).toBe('t2');
    expect(merged.snapshots.has('m2')).toBe(true);
  });

  it('drops what an earlier runtime reported when a new one starts', () => {
    const before = foldWorkFeedback(EMPTY, EPOCH, [snapshot('m1', 50)]);
    const later = '2026-10-03T12:00:00.000Z';
    const after = foldWorkFeedback(before, later, [snapshot('m2', 1, { epoch: later })]);
    expect(after.epoch).toBe(later);
    expect([...after.snapshots.keys()]).toEqual(['m2']);
    // A straggler from the earlier runtime changes nothing.
    expect(foldWorkFeedback(after, EPOCH, [snapshot('m1', 99)])).toBe(after);
  });

  it('returns the same view when nothing is newer, so a list does not re-render', () => {
    const view = foldWorkFeedback(EMPTY, EPOCH, [snapshot('m1', 5)]);
    expect(foldWorkFeedback(view, EPOCH, [snapshot('m1', 5)])).toBe(view);
  });
});
