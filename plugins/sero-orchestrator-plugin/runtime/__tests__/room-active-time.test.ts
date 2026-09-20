/**
 * A paused Room's clock stops, in the engine as well as on the screen.
 *
 * The captured defect: a Room paused nine days ago against a one-hour limit
 * read `229h 28m of 1h`. The header and `checkRoomLimits` both measured the
 * wall clock since `startedAt`, so the header was faithfully reporting a limit
 * that really did keep running while the Room sat paused.
 */

import { describe, expect, it } from 'vitest';
import type { Room, RoomRuntimeState, RoomStatus } from '../../shared/room-types';
import { elapsedActiveMs, isActiveStatus, withActiveTime } from '../../shared/room-active-time';
import { checkRoomLimits } from '../rooms/room-limits';

const T0 = Date.parse('2026-09-01T10:00:00.000Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const at = (ms: number) => new Date(T0 + ms).toISOString();

function runtime(over: Partial<RoomRuntimeState> = {}): RoomRuntimeState {
  return {
    status: 'running',
    startedAt: at(0),
    endedAt: null,
    activeMemberIds: [],
    usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, rosterRevisions: 0 },
    stopReason: null,
    messageSequence: 0,
    timelineSequence: 0,
    appliedCommandIds: [],
    lastProgressAt: null,
    ...over,
  } as RoomRuntimeState;
}

/** Moves a runtime to `status` at `ms`, the way `withRoomStatus` does. */
function transition(state: RoomRuntimeState, status: RoomStatus, ms: number): RoomRuntimeState {
  return { ...state, status, ...withActiveTime(state, status, at(ms)) };
}

function room(state: RoomRuntimeState, maxWallClockMs = HOUR): Room {
  return {
    definition: { envelope: { maxWallClockMs, maxCostUsd: 10, maxTokens: 1e9, maxRosterRevisions: 5 } },
    runtime: state,
    members: [],
  } as unknown as Room;
}

describe('a Room counts the time it was active', () => {
  it('banks the open period when it stops being active', () => {
    let state = transition(runtime({ status: 'ready', activeMs: 0, activeSince: null }), 'running', 0);
    expect(state.activeSince).toBe(at(0));
    state = transition(state, 'paused', 12 * MINUTE);
    expect(state.activeMs).toBe(12 * MINUTE);
    expect(state.activeSince).toBeNull();
  });

  it('does not grow while paused', () => {
    const paused = transition(transition(runtime({ activeMs: 0, activeSince: at(0) }), 'paused', 12 * MINUTE), 'paused', 12 * MINUTE);
    expect(elapsedActiveMs(paused, T0 + 9 * 24 * HOUR)).toBe(12 * MINUTE);
  });

  it('continues counting after a resume', () => {
    let state = transition(runtime({ activeMs: 0, activeSince: at(0) }), 'paused', 12 * MINUTE);
    state = transition(state, 'running', 9 * 24 * HOUR);
    expect(elapsedActiveMs(state, T0 + 9 * 24 * HOUR + 5 * MINUTE)).toBe(17 * MINUTE);
  });

  it('holds its figure once the Room has ended', () => {
    const done = transition(runtime({ activeMs: 0, activeSince: at(0) }), 'completed', 20 * MINUTE);
    expect(elapsedActiveMs(done, T0 + 30 * MINUTE)).toBe(20 * MINUTE);
    expect(elapsedActiveMs(done, T0 + 40 * HOUR)).toBe(20 * MINUTE);
  });

  it('treats paused, ready and draft as not working', () => {
    expect(isActiveStatus('running')).toBe(true);
    expect(isActiveStatus('pausing')).toBe(true);
    for (const status of ['paused', 'ready', 'draft', 'completed', 'cancelled'] as RoomStatus[]) {
      expect(isActiveStatus(status)).toBe(false);
    }
  });
});

describe('the time limit is tested against that same figure', () => {
  it('does not stop a Room paused for nine days after twelve active minutes', () => {
    const paused = transition(runtime({ activeMs: 0, activeSince: at(0) }), 'paused', 12 * MINUTE);
    const check = checkRoomLimits(room(paused), T0 + 9 * 24 * HOUR);
    expect(check.ok).toBe(true);
  });

  it('stops it once the active time passes the limit', () => {
    const over = transition(runtime({ activeMs: 0, activeSince: at(0) }), 'paused', 61 * MINUTE);
    const check = checkRoomLimits(room(over), T0 + 61 * MINUTE);
    expect(check.ok).toBe(false);
    expect(check.limit).toBe('maxWallClockMs');
  });
});

describe('a Room that predates active-time accounting', () => {
  it('keeps the time it has already used rather than a fresh budget', () => {
    // No activeMs at all: written before the accumulator existed.
    const legacy = runtime({ status: 'paused', activeMs: undefined, activeSince: undefined });
    expect(elapsedActiveMs(legacy, T0 + 40 * MINUTE)).toBe(40 * MINUTE);
    expect(elapsedActiveMs(legacy, T0 + 40 * MINUTE)).not.toBe(0);
  });

  it('stops growing from the first transition that banks it', () => {
    const legacy = runtime({ status: 'paused', activeMs: undefined, activeSince: undefined });
    const seeded = transition(legacy, 'paused', 40 * MINUTE);
    expect(seeded.activeMs).toBe(40 * MINUTE);
    expect(elapsedActiveMs(seeded, T0 + 9 * 24 * HOUR)).toBe(40 * MINUTE);
  });
});
