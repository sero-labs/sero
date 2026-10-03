/**
 * A Watch view streams each member's current turn.
 *
 * The Room record only changes at its own boundaries, so a tile that waited for
 * it showed nothing while a member wrote. While the view holds its lease the
 * runtime pushes each member's turn, one timer per member, and drops what it
 * holds once the view closes.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoomLiveActions } from '../rooms/room-app-live';
import type { RoomObservation } from '../rooms/room-observation';
import type { MemberLiveSnapshot, RoomMemberLiveNotice } from '../../shared/room-live-types';
import type { OrchestratorHost } from '../host';
import type { RoomStore } from '../rooms/room-store';

const ROOM = 'room-1';

function snapshot(memberId: string, text: string): MemberLiveSnapshot {
  return {
    roomId: ROOM,
    memberId,
    turnId: 'turn-1',
    text,
    truncated: false,
    toolInFlight: null,
    lastTurnStatus: null,
    watching: true,
    updatedAt: '2026-09-10T12:00:00.000Z',
    revision: 1,
  };
}

function harness() {
  let listener: ((event: { roomId: string; memberId: string }) => void) | null = null;
  const snapshots = new Map<string, MemberLiveSnapshot>();
  let unwatched = 0;

  const observation = {
    watchRoom: (_roomId: string, cb: (event: { roomId: string; memberId: string }) => void) => {
      listener = cb;
      return () => {
        unwatched += 1;
        listener = null;
      };
    },
    snapshotMember: (memberId: string) => snapshots.get(memberId) ?? null,
    snapshotRoom: () => [...snapshots.values()],
  } as unknown as RoomObservation;

  const notices: RoomMemberLiveNotice[] = [];
  const host = {
    now: () => '2026-09-10T12:00:00.000Z',
    notifyRoomLive: (notice: RoomMemberLiveNotice) => notices.push(notice),
  } as unknown as OrchestratorHost;

  const store = {} as unknown as RoomStore;

  return {
    live: createRoomLiveActions({ host, store, observation }),
    notices,
    /** Record what the member is writing now, then report the change. */
    write(memberId: string, text: string) {
      snapshots.set(memberId, snapshot(memberId, text));
      listener?.({ roomId: ROOM, memberId });
    },
    emitWithoutSnapshot(memberId: string) {
      listener?.({ roomId: ROOM, memberId });
    },
    unwatched: () => unwatched,
  };
}

describe('Room member live streaming', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('pushes a member’s turn while the View holds its lease', async () => {
    const h = harness();
    await h.live.watch(ROOM);

    h.write('member-1', 'Reading the first file.');

    expect(h.notices).toHaveLength(1);
    expect(h.notices[0].roomId).toBe(ROOM);
    expect(h.notices[0].snapshot.memberId).toBe('member-1');
    expect(h.notices[0].snapshot.text).toBe('Reading the first file.');
  });

  it('carries the newest text when a member writes faster than the rate', async () => {
    const h = harness();
    await h.live.watch(ROOM);

    h.write('member-1', 'one');
    h.write('member-1', 'one two');
    h.write('member-1', 'one two three');

    // The first frame went out at once; the rest are collapsed into one.
    expect(h.notices).toHaveLength(1);
    vi.advanceTimersByTime(200);

    expect(h.notices).toHaveLength(2);
    expect(h.notices[1].snapshot.text).toBe('one two three');
  });

  it('keeps a separate rate for each member', async () => {
    const h = harness();
    await h.live.watch(ROOM);

    h.write('member-1', 'a1');
    h.write('member-2', 'b1');
    h.write('member-1', 'a2');

    // Neither member waits on the other.
    expect(h.notices.map((notice) => notice.snapshot.memberId).sort()).toEqual(['member-1', 'member-2']);
    expect(h.notices.map((notice) => notice.snapshot.text)).toContain('b1');
  });

  it('stops pushing and drops what it held once the View closes', async () => {
    const h = harness();
    await h.live.watch(ROOM);
    h.write('member-1', 'one');
    h.write('member-1', 'two');

    await h.live.unwatch(ROOM);
    expect(h.unwatched()).toBe(1);

    // The held frame must not land after the view closed.
    vi.advanceTimersByTime(1000);
    expect(h.notices).toHaveLength(1);

    h.write('member-1', 'after close');
    expect(h.notices).toHaveLength(1);
  });

  it('ignores a change with no snapshot to show', async () => {
    const h = harness();
    await h.live.watch(ROOM);

    h.emitWithoutSnapshot('member-1');

    expect(h.notices).toHaveLength(0);
  });
});
