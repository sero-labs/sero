/**
 * The Room panel's decisions (phase 7).
 *
 * These are the parts of the panel that can be wrong rather than merely ugly:
 * when a re-read is needed, what a member that is not streaming is said to be
 * doing, and how two reads of one session's history combine.
 */

import { describe, expect, it } from 'vitest';
import type { PersistentSessionHistoryEntry } from '@sero-ai/common';
import type { MemberLiveSnapshot } from '../../shared/room-live-types';
import type { PersistedRoom } from '../../shared/room-types';
import type { PathClaim } from '../../shared/room-message-types';
import { claimOverlaps, defaultRoomView, memberPaneText, mergeHistory, roomSignal, toSessionTurns } from '../lib/room-view';

const room = (runtime: Partial<PersistedRoom['runtime']>): PersistedRoom =>
  ({
    runtime: {
      status: 'running',
      messageSequence: 4,
      usage: { costUsd: 1.5, turns: 9, inputTokens: 0, outputTokens: 0, rosterRevisions: 0, memberReplacements: 0 },
      activeMemberIds: ['lead'],
      ...runtime,
    },
  } as PersistedRoom);

const snapshot = (over: Partial<MemberLiveSnapshot>): MemberLiveSnapshot => ({
  roomId: 'room-1',
  memberId: 'lead',
  turnId: null,
  text: '',
  truncated: false,
  toolInFlight: null,
  lastTurnStatus: null,
  watching: true,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const entry = (over: Partial<PersistentSessionHistoryEntry>): PersistentSessionHistoryEntry => ({
  turnIndex: 1,
  timestamp: '2026-01-01T00:00:00.000Z',
  role: 'assistant',
  text: 'hello',
  ...over,
});

describe('when the panel re-reads', () => {
  it('changes when a turn, a message, spend or the active roster changes', () => {
    const base = roomSignal(room({}));
    expect(roomSignal(room({ messageSequence: 5 }))).not.toBe(base);
    expect(roomSignal(room({ activeMemberIds: ['lead', 'impl'] }))).not.toBe(base);
    expect(roomSignal(room({ status: 'paused' }))).not.toBe(base);
  });

  it('stays put when nothing the panel shows has moved', () => {
    expect(roomSignal(room({}))).toBe(roomSignal(room({})));
    expect(roomSignal(null)).toBe('');
  });
});

describe('which view a Room opens on', () => {
  it('opens a finished Room on its result and a live one on its activity', () => {
    expect(defaultRoomView('completed')).toBe('result');
    expect(defaultRoomView('failed')).toBe('result');
    expect(defaultRoomView('cancelled')).toBe('result');
    expect(defaultRoomView('running')).toBe('timeline');
    expect(defaultRoomView('paused')).toBe('timeline');
  });
});

describe('what a Watch pane says', () => {
  it('shows the live text when there is any', () => {
    expect(memberPaneText('working', snapshot({ text: 'editing session.ts' }))).toBe('editing session.ts');
  });

  it('explains a waiting member rather than leaving its last line up as live', () => {
    // The distinction the whole view rests on: waiting is free, not stuck.
    expect(memberPaneText('waiting', snapshot({ text: '' }))).toContain('no turn is held');
  });

  it('says a retired member is readable, and that an unwatched one is simply quiet', () => {
    expect(memberPaneText('retired', null)).toContain('closed but kept');
    expect(memberPaneText('idle', null)).toContain('Nothing is streaming');
  });

  it('says a turn is under way before it has produced text', () => {
    expect(memberPaneText('working', snapshot({ turnId: 'turn-3' }))).toContain('no text yet');
  });
});

describe('reading a member session', () => {
  it('groups entries into turns, oldest first, and marks a compaction in place', () => {
    const turns = toSessionTurns([
      entry({ turnIndex: 3, text: 'latest' }),
      entry({ turnIndex: 2, text: 'compacted here', compactionBoundary: true }),
      entry({ turnIndex: 2, text: 'earlier in turn 2' }),
      entry({ turnIndex: 1, text: 'first' }),
    ]);

    expect(turns.map((turn) => turn.index)).toEqual([1, 2, 3]);
    expect(turns[1].compacted).toBe(true);
    // Within a turn the transcript reads forwards too.
    expect(turns[1].entries.map((one) => one.text)).toEqual(['earlier in turn 2', 'compacted here']);
  });

  it('does not repeat a turn when the newest page is re-read', () => {
    const older = [entry({ turnIndex: 1, text: 'first' })];
    const reread = [entry({ turnIndex: 2, text: 'second' }), entry({ turnIndex: 1, text: 'first' })];

    const merged = mergeHistory(reread, older);
    expect(merged.map((one) => one.text)).toEqual(['second', 'first']);
  });

  it('keeps two entries that only look alike', () => {
    const merged = mergeHistory(
      [entry({ turnIndex: 1, role: 'assistant', text: 'same' })],
      [entry({ turnIndex: 1, role: 'tool', text: 'same' })],
    );
    expect(merged).toHaveLength(2);
  });
});

const claim = (memberId: string, pattern: string): PathClaim => ({
  id: `${memberId}:${pattern}`,
  roomId: 'room-1',
  memberId,
  pattern,
  reason: 'working here',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  releasedAt: null,
});

describe('who is about to edit the same file', () => {
  it('pairs two members whose claims meet, including through a directory claim', () => {
    const overlaps = claimOverlaps([
      claim('impl-1', 'src/auth/session.ts'),
      claim('impl-2', 'src/auth'),
      claim('tester', 'tests/auth/**'),
    ]);

    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].members).toEqual(['impl-1', 'impl-2']);
  });

  it('does not warn about one member claiming two paths, or about paths that never meet', () => {
    // Same member, and the two patterns DO meet — it is only overlapping itself.
    expect(claimOverlaps([claim('impl-1', 'src/auth'), claim('impl-1', 'src/auth/session.ts')])).toEqual([]);
    expect(claimOverlaps([claim('impl-1', 'src/a.ts'), claim('impl-2', 'src/b.ts')])).toEqual([]);
  });
});
