/**
 * Agent Rooms grouping is derived without reading Orchestrator state.
 *
 * Every input here is what the scanner already produces — a session path and a
 * Pi session name. No test reaches for Orchestrator metadata, because the
 * aggregator must never need it.
 */

import { describe, expect, it } from 'vitest';

import { aggregate, type RoomLabel } from '../aggregate';
import type { ParsedSession, UsageMessage } from '../scan';

// Fixed reference: Wednesday 2026-07-08, 15:30 local time.
const NOW = new Date(2026, 6, 8, 15, 30);
const BASE_TS = new Date(2026, 6, 8, 9, 0).getTime();

let nextOffset = 0;

/** Distinct timestamps keep the global fingerprint dedup out of the way. */
function msg(overrides: Partial<UsageMessage> = {}): UsageMessage {
  nextOffset += 1;
  return {
    provider: 'anthropic',
    model: 'claude-opus-4-5',
    cost: 1,
    input: 100,
    output: 50,
    cacheRead: 1000,
    cacheWrite: 200,
    timestamp: BASE_TS + nextOffset * 1000,
    ...overrides,
  };
}

function roomSession(
  roomId: string,
  memberId: string,
  name: string | undefined,
  messages: UsageMessage[],
): ParsedSession {
  return {
    sessionId: `${roomId}-${memberId}`,
    path: `/sessions/rooms/${roomId}/${memberId}.jsonl`,
    cwd: '/workspaces/api',
    name,
    messages,
  };
}

function chatSession(id: string, messages: UsageMessage[], name?: string): ParsedSession {
  return {
    sessionId: id,
    path: `/sessions/${id}.jsonl`,
    cwd: `/workspaces/${id}`,
    name,
    messages,
  };
}

describe('Room grouping', () => {
  it('collapses a Room’s member sessions into one Room row', () => {
    const result = aggregate(
      [
        roomSession('room_a1', 'conductor', 'Room Ship the API — Conductor', [msg({ cost: 4 })]),
        roomSession('room_a1', 'builder', 'Room Ship the API — Builder', [msg({ cost: 3 })]),
        roomSession('room_a1', 'reviewer', 'Room Ship the API — Reviewer', [msg({ cost: 2 })]),
      ],
      NOW,
    );

    const rows = result.periods.allTime.topSessions;
    expect(rows).toHaveLength(1);

    const room = rows[0]!;
    expect(room.label).toBe('Room Ship the API');
    expect(room.cost).toBe(9);
    expect(room.messages).toBe(3);
    expect(room.tokens.total).toBe(3 * (100 + 50 + 200));
    expect(room.room?.roomId).toBe('room_a1');
    expect(room.room?.title).toBe('Ship the API');
    // The Room row points at the Room's session directory, not one member file.
    expect(room.path).toBe('/sessions/rooms/room_a1');
  });

  it('lists per-member rows under the Room, cost desc, labelled by role', () => {
    const result = aggregate(
      [
        roomSession('room_a1', 'builder', 'Room Ship the API — Builder', [msg({ cost: 3 })]),
        roomSession('room_a1', 'conductor', 'Room Ship the API — Conductor', [msg({ cost: 7 })]),
      ],
      NOW,
    );

    const members = result.periods.allTime.topSessions[0]!.room?.members ?? [];
    expect(members.map((member) => member.label)).toEqual(['Conductor', 'Builder']);
    expect(members.map((member) => member.cost)).toEqual([7, 3]);
    // A member row keeps its own session file so reveal-in-folder still works.
    expect(members[0]!.path).toBe('/sessions/rooms/room_a1/conductor.jsonl');
  });

  it('splits on the last separator, so a title may contain an em dash', () => {
    const result = aggregate(
      [roomSession('room_a1', 'conductor', 'Room Ship — the API — Conductor', [msg({ cost: 1 })])],
      NOW,
    );

    const room = result.periods.allTime.topSessions[0]!;
    expect(room.room?.title).toBe('Ship — the API');
    expect(room.room?.members[0]!.label).toBe('Conductor');
  });

  it('keeps separate Rooms in separate rows', () => {
    const result = aggregate(
      [
        roomSession('room_a1', 'conductor', 'Room Ship the API — Conductor', [msg({ cost: 5 })]),
        roomSession('room_b2', 'conductor', 'Room Fix the docs — Conductor', [msg({ cost: 2 })]),
      ],
      NOW,
    );

    const rows = result.periods.allTime.topSessions;
    expect(rows.map((row) => row.label)).toEqual(['Room Ship the API', 'Room Fix the docs']);
    expect(rows.map((row) => row.room?.roomId)).toEqual(['room_a1', 'room_b2']);
  });

  it('groups Room sessions that carry no path room id, by name and directory', () => {
    // The persistent-session host currently stores a Room's members under a
    // grant directory, so the name may be the only Room marker in the path.
    const grantSession = (member: string, cost: number): ParsedSession => ({
      sessionId: `ses_${member}`,
      path: `/sessions/orchestrator/grant_x1/${member}.jsonl`,
      cwd: '/workspaces/api',
      name: `Room Ship the API — ${member}`,
      messages: [msg({ cost })],
    });

    const result = aggregate([grantSession('Conductor', 4), grantSession('Builder', 1)], NOW);

    const rows = result.periods.allTime.topSessions;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe('Room Ship the API');
    expect(rows[0]!.cost).toBe(5);
    expect(rows[0]!.room?.roomId).toBeNull();
    expect(rows[0]!.room?.members).toHaveLength(2);
  });
});

describe('ordinary chats', () => {
  it('leaves ordinary sessions ungrouped alongside Room rows', () => {
    const result = aggregate(
      [
        chatSession('chat1', [msg({ cost: 6 })], 'Named session'),
        chatSession('chat2', [msg({ cost: 2 })]),
        roomSession('room_a1', 'conductor', 'Room Ship the API — Conductor', [msg({ cost: 4 })]),
      ],
      NOW,
    );

    const rows = result.periods.allTime.topSessions;
    expect(rows.map((row) => row.label)).toEqual(['Named session', 'Room Ship the API', 'chat2']);
    expect(rows.filter((row) => row.room !== undefined)).toHaveLength(1);
    expect(rows[0]!.room).toBeUndefined();
    expect(rows[2]!.room).toBeUndefined();
  });

  it('does not group a chat whose name merely starts with Room', () => {
    const result = aggregate([chatSession('chat1', [msg({})], 'Room booking notes')], NOW);
    const rows = result.periods.allTime.topSessions;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.room).toBeUndefined();
    expect(rows[0]!.label).toBe('Room booking notes');
  });

  it('does not treat a directory merely ending in "rooms" as the Room namespace', () => {
    const result = aggregate(
      [
        {
          sessionId: 'chat1',
          path: '/sessions/chatrooms/x1/session.jsonl',
          cwd: '/workspaces/api',
          name: 'My notes',
          messages: [msg({ cost: 1 })],
        },
      ],
      NOW,
    );

    const rows = result.periods.allTime.topSessions;
    expect(rows[0]!.room).toBeUndefined();
    expect(rows[0]!.label).toBe('My notes');
  });

  it('groups a Windows session path, where the separator is a backslash', () => {
    const result = aggregate(
      [
        {
          sessionId: 'win-impl',
          path: 'C:\\Users\\dev\\.sero\\sessions\\rooms\\room-w\\impl.jsonl',
          cwd: 'C:\\workspaces\\api',
          name: 'Room: Ship the API — Implementer',
          messages: [msg({ cost: 2 })],
        },
      ],
      NOW,
    );

    // Without separator normalisation this member reads as an unexplained
    // ordinary chat, which is the whole reason a user cannot account for it.
    const row = result.periods.allTime.topSessions[0]!;
    expect(row.room?.roomId).toBe('room-w');
  });

  it('leaves period totals counting real sessions, not Room rows', () => {
    const result = aggregate(
      [
        roomSession('room_a1', 'conductor', 'Room Ship the API — Conductor', [msg({ cost: 1 })]),
        roomSession('room_a1', 'builder', 'Room Ship the API — Builder', [msg({ cost: 1 })]),
        chatSession('chat1', [msg({ cost: 1 })]),
      ],
      NOW,
    );

    expect(result.periods.allTime.totals.sessions).toBe(3);
    expect(result.periods.allTime.totals.cost).toBe(3);
    expect(result.periods.allTime.topSessions).toHaveLength(2);
  });
});

describe('grouping without Room metadata', () => {
  it('groups with no lookup supplied at all', () => {
    const result = aggregate(
      [
        roomSession('room_a1', 'conductor', 'Room Ship the API — Conductor', [msg({ cost: 3 })]),
        roomSession('room_a1', 'builder', 'Room Ship the API — Builder', [msg({ cost: 1 })]),
      ],
      NOW,
    );

    const room = result.periods.allTime.topSessions[0]!;
    expect(room.cost).toBe(4);
    expect(room.room?.link).toBeUndefined();
  });

  it('enriches only labels and links when a published lookup is supplied', () => {
    const roomLabels = new Map<string, RoomLabel>([
      ['room_a1', { title: 'Ship the API v2', link: 'sero://orchestrator/rooms/room_a1' }],
    ]);
    const sessions = [
      roomSession('room_a1', 'conductor', 'Room Ship the API — Conductor', [msg({ cost: 3 })]),
      roomSession('room_a1', 'builder', 'Room Ship the API — Builder', [msg({ cost: 1 })]),
    ];

    const enriched = aggregate(sessions, NOW, { roomLabels });
    const plain = aggregate(sessions, NOW);

    const enrichedRoom = enriched.periods.allTime.topSessions[0]!;
    const plainRoom = plain.periods.allTime.topSessions[0]!;
    expect(enrichedRoom.label).toBe('Room Ship the API v2');
    expect(enrichedRoom.room?.link).toBe('sero://orchestrator/rooms/room_a1');
    // Enrichment changes labels only — every number matches the unenriched run.
    expect(enrichedRoom.cost).toBe(plainRoom.cost);
    expect(enrichedRoom.messages).toBe(plainRoom.messages);
    expect(enrichedRoom.room?.members).toHaveLength(plainRoom.room?.members.length ?? 0);
  });

  it('ignores a lookup entry for an unrelated Room', () => {
    const roomLabels = new Map<string, RoomLabel>([['room_zz', { title: 'Wrong Room' }]]);
    const result = aggregate(
      [roomSession('room_a1', 'conductor', 'Room Ship the API — Conductor', [msg({ cost: 3 })])],
      NOW,
      { roomLabels },
    );
    expect(result.periods.allTime.topSessions[0]!.label).toBe('Room Ship the API');
  });
});

describe('malformed session names', () => {
  it('falls back to the room id and keeps the member’s cost in the Room', () => {
    const result = aggregate(
      [
        roomSession('room_a1', 'conductor', 'Room-Ship the API/Conductor', [msg({ cost: 5 })]),
        roomSession('room_a1', 'builder', undefined, [msg({ cost: 2 })]),
      ],
      NOW,
    );

    const rows = result.periods.allTime.topSessions;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe('Room room_a1');
    expect(rows[0]!.room?.title).toBeNull();
    expect(rows[0]!.room?.roomId).toBe('room_a1');
    expect(rows[0]!.cost).toBe(7);
    // A member with no usable role keeps whatever label it has, but stays in.
    expect(rows[0]!.room?.members.map((member) => member.label)).toEqual([
      'Room-Ship the API/Conductor',
      'room_a1-builder',
    ]);
  });

  it('titles the Room from any one well-formed member name', () => {
    const result = aggregate(
      [
        roomSession('room_a1', 'builder', 'truncated name with no separator', [msg({ cost: 9 })]),
        roomSession('room_a1', 'conductor', 'Room Ship the API — Conductor', [msg({ cost: 1 })]),
      ],
      NOW,
    );

    const room = result.periods.allTime.topSessions[0]!;
    expect(room.label).toBe('Room Ship the API');
    expect(room.cost).toBe(10);
  });
});

describe('ranking', () => {
  it('ranks the Room by its grouped total, not by one member', () => {
    const result = aggregate(
      [
        chatSession('chat1', [msg({ cost: 5 })], 'Expensive chat'),
        roomSession('room_a1', 'conductor', 'Room Ship the API — Conductor', [msg({ cost: 3 })]),
        roomSession('room_a1', 'builder', 'Room Ship the API — Builder', [msg({ cost: 3 })]),
      ],
      NOW,
    );

    expect(result.periods.allTime.topSessions.map((row) => row.label)).toEqual([
      'Room Ship the API',
      'Expensive chat',
    ]);
  });

  it('applies the top-50 cut after grouping, so no Room loses members', () => {
    const rooms = Array.from({ length: 60 }, (_unused, index) =>
      roomSession(`room_${index}`, 'conductor', `Room Team ${index} — Conductor`, [
        msg({ cost: 100 - index }),
      ]),
    );
    const bigRoom = [
      roomSession('room_big', 'a', 'Room Big — A', [msg({ cost: 1 })]),
      roomSession('room_big', 'b', 'Room Big — B', [msg({ cost: 1 })]),
    ];

    const result = aggregate([...rooms, ...bigRoom], NOW);
    const rows = result.periods.allTime.topSessions;
    expect(rows).toHaveLength(50);
    expect(rows.every((row) => row.room !== undefined)).toBe(true);
    expect(rows[0]!.room?.roomId).toBe('room_0');
  });
});
