import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AppRuntimeContext } from '@sero-ai/common';
import { createRoomStore } from '../rooms/room-store';
import { MESSAGE_PAGE_SIZE } from '../rooms/room-messages';
import { DEFAULT_ROOM_RETENTION, ROOM_SCHEMA_VERSION, type RoomRecord } from '../rooms/room-state';
import type { RoomMember } from '../../shared/room-types';
import type { OperatingEnvelope, RoomBlueprint, RoomProposalSummary } from '../../shared/room-blueprint-types';

let dir: string;
let writes: string[];

function makeCtx(): AppRuntimeContext {
  const appState = {
    read: async (file: string) => {
      if (!existsSync(file)) return null;
      return JSON.parse(await readFile(file, 'utf8'));
    },
    update: async (file: string, updater: (current: unknown) => unknown) => {
      writes.push(path.relative(dir, file));
      const current = existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : null;
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(updater(current)), 'utf8');
    },
  };
  return { stateFilePath: path.join(dir, 'state.json'), host: { appState } } as unknown as AppRuntimeContext;
}

const envelope: OperatingEnvelope = {
  maxMembers: 4, maxActiveTurns: 2, maxRosterRevisions: 5, maxMemberReplacements: 2,
  maxWallClockMs: 1000, maxCostUsd: 5, maxCostUsdPerMember: 2, maxTokens: 10, maxTokensPerMember: 5,
  maxTurnsPerMember: 3, maxRetriesPerMember: 2, maxConsecutiveFailures: 2, allowedModels: [],
  allowedThinkingLevels: [], allowedTools: [], allowedSkills: [],
  workspacePolicy: { mode: 'read-only-shared', sharedTreeApproved: false, claimPolicy: 'warn' },
  allowedDeliveryDestinations: [], allowNestedSubagents: false, maxIdleMs: 1000,
};

const blueprint = { schemaVersion: 1, title: 't', members: [] } as unknown as RoomBlueprint;
const proposal = { teamSize: 1 } as unknown as RoomProposalSummary;

function member(id: string): RoomMember {
  return {
    id, roomId: 'room-a', displayName: id, isConductor: id === 'm1', responsibility: 'r',
    status: 'idle', statusDetail: '', statusAt: '2026-01-01T00:00:00.000Z',
    mandate: { role: 'r', responsibilities: '', currentTask: '', priorities: [], workingInstructions: '', revision: 1, updatedAt: 't' },
    configuration: { model: 'm', thinking: 'off', promptAdditions: [], tools: [], skills: [], permissions: 'read-only', needsWorktree: false, revision: 1 },
    session: { subject: id, sessionId: null, sessionPath: null, workspaceId: 'w', liveHandleId: null, lastOpenedAt: null, lastClosedAt: null, compactionCount: 0, lastCompactedAt: null },
    usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, turns: 0, retries: 0, consecutiveFailures: 0 },
    worktreePath: null, worktreeBranch: null, waitingOnQuestionId: null, replacedByMemberId: null,
    createdAt: 't', retiredAt: null,
  };
}

function roomFixture(id: string): RoomRecord {
  return {
    definition: {
      id, title: `Room ${id}`, problemStatement: 'p', blueprint, proposal, envelope,
      workspacePolicy: envelope.workspacePolicy, grantId: null, createdAt: 't', updatedAt: 't',
    },
    runtime: {
      status: 'running', startedAt: 't', endedAt: null, activeMemberIds: [],
      usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, turns: 0, rosterRevisions: 0, memberReplacements: 0 },
      stopReason: null, messageSequence: 0, timelineSequence: 0, appliedCommandIds: [], lastProgressAt: null,
    },
    members: [member('m1'), member('m2')],
    brief: { objective: 'o', successCriteria: [], decisions: [], activeWork: [], blockers: [], openQuestions: [], artifactRefs: [], updatedAt: 't', conductorNote: null, conductorNoteAt: null },
    delivery: { destination: 'saved-artifact', params: {}, originSessionId: null, originWorkspaceId: null, deliveredAt: null, deliveryRef: null },
    archivedAt: null,
    revisions: [],
    readCursors: [],
    approvals: [],
    work: [],
    artifacts: [],
    claims: [],
  };
}

const draft = (from: string, to: string[], body: string, commandId: string) => ({
  id: commandId, kind: 'direct' as const, fromMemberId: from, toMemberIds: to, body,
  questionId: null, inReplyToQuestionId: null, wakeRecipients: true, commandId, createdAt: 't',
});

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'room-store-'));
  writes = [];
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('room store', () => {
  it('splits a room across files and seeds member cursors', async () => {
    const store = createRoomStore(makeCtx());
    await store.updateState((s) => ({ ...s, rooms: [...s.rooms, roomFixture('room-a')] }));
    expect(existsSync(path.join(dir, 'rooms/index.json'))).toBe(true);
    const room = JSON.parse(await readFile(path.join(dir, 'rooms/room-a/room.json'), 'utf8'));
    expect(room.memberIds).toEqual(['m1', 'm2']);
    expect(room.readCursors.map((c: { memberId: string }) => c.memberId)).toEqual(['m1', 'm2']);
    expect(existsSync(path.join(dir, 'rooms/room-a/members/m1.json'))).toBe(true);
    const index = JSON.parse(await readFile(path.join(dir, 'rooms/index.json'), 'utf8'));
    expect(index.schemaVersion).toBe(ROOM_SCHEMA_VERSION);
    expect(index.rooms[0].memberCount).toBe(2);
  });

  it('a member write touches only that member file, and the index only when the summary moves', async () => {
    const store = createRoomStore(makeCtx());
    await store.updateState((s) => ({ ...s, rooms: [roomFixture('room-a'), roomFixture('room-b')] }));
    writes = [];
    await store.updateMember('room-a', 'm2', (m) => ({ ...m, status: 'working', statusDetail: 'x' }));
    expect(writes).toEqual(['rooms/room-a/members/m2.json']);
    await store.updateRoom('room-a', (r) => ({ ...r, runtime: { ...r.runtime, activeMemberIds: ['m2'] } }));
    expect(writes).toEqual([
      'rooms/room-a/members/m2.json',
      'rooms/room-a/room.json',
      'rooms/index.json',
    ]);
  });

  it('stamps statusAt when a member changes status, and only then', async () => {
    const store = createRoomStore(makeCtx());
    await store.updateState((s) => ({ ...s, rooms: [roomFixture('room-a')] }));
    const fixtureStamp = '2026-01-01T00:00:00.000Z';
    await store.updateMember('room-a', 'm1', (m) => ({ ...m, statusDetail: 'thinking' }));
    expect((await store.readMember('room-a', 'm1'))?.statusAt).toBe(fixtureStamp);
    await store.updateMember('room-a', 'm1', (m) => ({ ...m, status: 'working' }));
    const stamped = (await store.readMember('room-a', 'm1'))?.statusAt;
    expect(stamped).not.toBe(fixtureStamp);
    expect(Date.parse(stamped ?? '')).not.toBeNaN();
  });

  it('reloads from disk with members, cursors and revisions intact', async () => {
    const ctx = makeCtx();
    const store = createRoomStore(ctx);
    await store.updateState((s) => ({ ...s, rooms: [roomFixture('room-a')] }));
    await store.updateMember('room-a', 'm1', (m) => ({ ...m, status: 'working' }));
    const reloaded = await createRoomStore(makeCtx()).readState();
    expect(reloaded.rooms[0].members.map((m) => m.status)).toEqual(['working', 'idle']);
    expect(reloaded.rooms[0].readCursors).toHaveLength(2);
  });

  it('pages messages, tracks pending counts and delivers from the cursor', async () => {
    const store = createRoomStore(makeCtx());
    await store.updateState((s) => ({ ...s, rooms: [roomFixture('room-a')] }));
    await store.appendMessages('room-a', [draft('m1', ['m2'], 'one', 'c1'), draft('m1', [], 'all', 'c2')]);
    const page = JSON.parse(await readFile(path.join(dir, 'rooms/room-a/messages/1.json'), 'utf8'));
    expect(page.map((m: { sequence: number }) => m.sequence)).toEqual([1, 2]);
    const room = await store.readRoom('room-a');
    expect(room?.runtime.messageSequence).toBe(2);
    expect(room?.readCursors.find((c) => c.memberId === 'm2')?.pendingCount).toBe(2);
    const taken = await store.leaseMessagesFor('room-a', 'm2', 10);
    expect(taken.messages.map((m) => m.body)).toEqual(['one', 'all']);
    await store.acknowledgeMessages('room-a', 'm2', taken.throughSequence);
    const after = await store.readRoom('room-a');
    expect(after?.readCursors.find((c) => c.memberId === 'm2')?.pendingCount).toBe(0);
    expect((await store.leaseMessagesFor('room-a', 'm2', 10)).messages).toEqual([]);
    // the sender is not a recipient of its own broadcast
    expect((await store.leaseMessagesFor('room-a', 'm1', 10)).messages).toEqual([]);
  });

  it('replays a leased batch after a restart, and never after it was acknowledged', async () => {
    const store = createRoomStore(makeCtx());
    await store.updateState((s) => ({ ...s, rooms: [roomFixture('room-a')] }));
    await store.appendMessages('room-a', [draft('m1', ['m2'], 'one', 'c1'), draft('m1', ['m2'], 'two', 'c2')]);

    const leased = await store.leaseMessagesFor('room-a', 'm2', 10);
    expect(leased.messages.map((m) => m.body)).toEqual(['one', 'two']);
    // The turn never accepted the prompt. The cursor must not claim it did.
    expect((await store.readRoom('room-a'))?.readCursors.find((c) => c.memberId === 'm2')?.lastReadSequence).toBe(0);

    const restarted = createRoomStore(makeCtx());
    const replayed = await restarted.leaseMessagesFor('room-a', 'm2', 10);
    expect(replayed.messages.map((m) => m.body)).toEqual(['one', 'two']);

    await restarted.acknowledgeMessages('room-a', 'm2', replayed.throughSequence);
    const settled = createRoomStore(makeCtx());
    expect((await settled.leaseMessagesFor('room-a', 'm2', 10)).messages).toEqual([]);
    expect((await settled.readRoom('room-a'))?.readCursors.find((c) => c.memberId === 'm2')?.lease).toBeNull();
  });

  it('ignores an acknowledgement for a position the member is not holding', async () => {
    const store = createRoomStore(makeCtx());
    await store.updateState((s) => ({ ...s, rooms: [roomFixture('room-a')] }));
    await store.appendMessages('room-a', [draft('m1', ['m2'], 'one', 'c1')]);
    await store.leaseMessagesFor('room-a', 'm2', 10);

    await store.acknowledgeMessages('room-a', 'm2', 99);
    expect((await store.leaseMessagesFor('room-a', 'm2', 10)).messages.map((m) => m.body)).toEqual(['one']);
  });

  it('applies a command once and bounds the applied list by retention', async () => {
    const store = createRoomStore(makeCtx(), { ...DEFAULT_ROOM_RETENTION, maxAppliedCommandIds: 8 });
    await store.updateState((s) => ({ ...s, rooms: [roomFixture('room-a')] }));
    expect(await store.applyCommand('room-a', 'cmd-1', (r) => ({ ...r, archivedAt: null }))).toBe(true);
    expect(await store.applyCommand('room-a', 'cmd-1', (r) => r)).toBe(false);
    expect(await store.hasAppliedCommand('room-a', 'cmd-1')).toBe(true);
    for (let i = 0; i < 10; i += 1) await store.applyCommand('room-a', `bulk-${i}`, (r) => r);
    const room = await store.readRoom('room-a');
    expect(room?.runtime.appliedCommandIds).toHaveLength(8);
    expect(await store.hasAppliedCommand('room-a', 'cmd-1')).toBe(false);
  });

  it('keeps more keys than there are keyed records to guard', () => {
    // Every retained message can carry a key, so message retention is part of
    // this sum — it was missed once, and keys then evicted while their messages
    // were still on disk, which lets a retry duplicate a delivered message.
    const keyedRecords =
      DEFAULT_ROOM_RETENTION.maxMessagePages * MESSAGE_PAGE_SIZE + DEFAULT_ROOM_RETENTION.maxRevisions + 200 + 200;
    expect(DEFAULT_ROOM_RETENTION.maxAppliedCommandIds).toBeGreaterThan(keyedRecords);
  });

  it('never prunes a page a member has not read yet', async () => {
    // One page kept, but m2 has read nothing: retention must yield to delivery.
    const store = createRoomStore(makeCtx(), { ...DEFAULT_ROOM_RETENTION, maxMessagePages: 1 });
    await store.updateState((s) => ({ ...s, rooms: [...s.rooms, roomFixture('room-a')] }));
    await store.appendMessages('room-a', [draft('m1', ['m2'], 'the first thing', 'c1')]);

    // Push past the retained window: without a floor, page 1 is deleted here.
    for (let i = 0; i < MESSAGE_PAGE_SIZE * 2; i += 1) {
      await store.appendMessages('room-a', [draft('m1', ['m2'], `filler ${i}`, `f${i}`)]);
    }

    const leased = await store.leaseMessagesFor('room-a', 'm2', 5);
    expect(leased.messages[0]?.body).toBe('the first thing');
  });

  it('keeps a key for the default retention, well past the records it guards', async () => {
    const store = createRoomStore(makeCtx());
    await store.updateState((s) => ({ ...s, rooms: [roomFixture('room-a')] }));
    await store.applyCommand('room-a', 'cmd-1', (r) => r);
    // 200 revisions, 200 work items and 200 artifacts is everything one Room can
    // hold at once; the key must still be there after that many commands.
    for (let i = 0; i < 600; i += 1) await store.applyCommand('room-a', `bulk-${i}`, (r) => r);
    expect(await store.hasAppliedCommand('room-a', 'cmd-1')).toBe(true);
  });

  it('writes messages and their command key in one turn, and refuses the retry', async () => {
    const store = createRoomStore(makeCtx());
    await store.updateState((s) => ({ ...s, rooms: [roomFixture('room-a')] }));
    const first = await store.appendMessagesOnce('room-a', 'cmd-9', [draft('m1', ['m2'], 'one', 'cmd-9')]);
    expect(first).toHaveLength(1);
    // The key is only ever recorded with the messages, so seeing it means the
    // log has them.
    expect(await store.hasAppliedCommand('room-a', 'cmd-9')).toBe(true);
    expect(await store.appendMessagesOnce('room-a', 'cmd-9', [draft('m1', ['m2'], 'again', 'cmd-9')])).toBeNull();
    expect(await store.readMessages('room-a', 0, 10)).toHaveLength(1);
  });

  it('appends a bounded jsonl timeline and reads it newest first', async () => {
    const store = createRoomStore(makeCtx(), {
      ...DEFAULT_ROOM_RETENTION, maxMessagePages: 2, maxRevisions: 10, maxTimelineBytes: 400,
    });
    await store.updateState((s) => ({ ...s, rooms: [roomFixture('room-a')] }));
    for (let i = 0; i < 12; i += 1) {
      await store.appendTimeline('room-a', [
        { id: `e${i}`, roomId: 'room-a', at: 't', kind: 'member-status', memberId: 'm1', summary: `event ${i}`, details: null },
      ]);
    }
    expect(existsSync(path.join(dir, 'rooms/room-a/timeline.1.jsonl'))).toBe(true);
    const events = await store.readTimeline('room-a', 3);
    expect(events.map((e) => e.summary)).toEqual(['event 11', 'event 10', 'event 9']);
  });

  it('repairs a Room written by an older build when it is loaded', async () => {
    // A v1 Room has no `timelineSequence`. Without the migration every append
    // would compute NaN and the panel would stop re-reading altogether.
    const record = roomFixture('room-a');
    const { timelineSequence: _dropped, ...v1Runtime } = record.runtime;
    const { members, revisions: _revisions, ...rest } = record;
    await mkdir(path.join(dir, 'rooms/room-a/members'), { recursive: true });
    await writeFile(
      path.join(dir, 'rooms/index.json'),
      JSON.stringify({ schemaVersion: 1, rooms: [{ id: 'room-a', title: 'Room room-a', status: 'running' }] }),
      'utf8',
    );
    await writeFile(
      path.join(dir, 'rooms/room-a/room.json'),
      JSON.stringify({ ...rest, runtime: v1Runtime, memberIds: members.map((one) => one.id) }),
      'utf8',
    );
    for (const member of members) {
      await writeFile(path.join(dir, `rooms/room-a/members/${member.id}.json`), JSON.stringify(member), 'utf8');
    }

    const store = createRoomStore(makeCtx());
    expect((await store.readRoom('room-a'))?.runtime.timelineSequence).toBe(0);
    await store.appendTimeline('room-a', [
      { id: 'e1', roomId: 'room-a', at: 't', kind: 'claim', memberId: 'm1', summary: 'claimed', details: null },
    ]);
    expect((await store.readRoom('room-a'))?.runtime.timelineSequence).toBe(1);

    const index = JSON.parse(await readFile(path.join(dir, 'rooms/index.json'), 'utf8'));
    expect(index.schemaVersion).toBe(ROOM_SCHEMA_VERSION);
  });

  it('rebuilds a summary an older build left stale, without waiting for the Room to move', async () => {
    // The index is what the home inbox reads. A Room paused by an older build
    // carried a summary that predates what the inbox now shows, and nothing was
    // going to touch that record again — so the Room sat waiting for the user
    // while the inbox said there was nothing to do.
    const store = createRoomStore(makeCtx());
    await store.updateState((state) => ({ ...state, rooms: [roomFixture('room-a')] }));
    const indexPath = path.join(dir, 'rooms/index.json');
    const stale = JSON.parse(await readFile(indexPath, 'utf8'));
    stale.rooms[0].attentionCount = 99;
    await writeFile(indexPath, JSON.stringify(stale), 'utf8');

    await createRoomStore(makeCtx()).readState();
    const repaired = JSON.parse(await readFile(indexPath, 'utf8'));
    expect(repaired.rooms[0].attentionCount).toBe(0);
  });

  it('moves the record when the timeline moves, so a watcher learns of it', async () => {
    // A claim or a revision appends an event without touching anything else the
    // Room panel follows. Without this the panel would show a stale timeline
    // until the next turn happened to write room.json.
    const store = createRoomStore(makeCtx());
    await store.updateState((s) => ({ ...s, rooms: [roomFixture('room-a')] }));
    const event = (id: string) => ({
      id, roomId: 'room-a', at: 't', kind: 'claim' as const, memberId: 'm1', summary: id, details: null,
    });

    await store.appendTimeline('room-a', [event('e1'), event('e2')]);
    expect((await store.readRoom('room-a'))?.runtime.timelineSequence).toBe(2);
    const persisted = JSON.parse(await readFile(path.join(dir, 'rooms/room-a/room.json'), 'utf8'));
    expect(persisted.runtime.timelineSequence).toBe(2);

    await store.appendTimeline('room-a', [event('e3')]);
    expect((await store.readRoom('room-a'))?.runtime.timelineSequence).toBe(3);
  });

  it('deletes the whole room dir and drops it from the index', async () => {
    const store = createRoomStore(makeCtx());
    await store.updateState((s) => ({ ...s, rooms: [roomFixture('room-a'), roomFixture('room-b')] }));
    await store.appendMessages('room-a', [draft('m1', ['m2'], 'one', 'c1')]);
    await store.deleteRoom('room-a');
    expect(existsSync(path.join(dir, 'rooms/room-a'))).toBe(false);
    expect(existsSync(path.join(dir, 'rooms/room-b/room.json'))).toBe(true);
    const index = JSON.parse(await readFile(path.join(dir, 'rooms/index.json'), 'utf8'));
    expect(index.rooms.map((r: { id: string }) => r.id)).toEqual(['room-b']);
  });

  it('archives, keeps the room listed, and prunes old message pages', async () => {
    const store = createRoomStore(makeCtx(), {
      ...DEFAULT_ROOM_RETENTION, maxMessagePages: 1, maxRevisions: 10, maxTimelineBytes: 1000,
    });
    await store.updateState((s) => ({ ...s, rooms: [roomFixture('room-a')] }));
    for (let i = 0; i < 205; i += 1) {
      await store.appendMessages('room-a', [draft('m1', ['m2'], `b${i}`, `c${i}`)]);
    }
    expect(existsSync(path.join(dir, 'rooms/room-a/messages/2.json'))).toBe(true);
    // Still there while the Room runs: m2 has read none of it, and retention
    // does not get to consume an undelivered message.
    expect(existsSync(path.join(dir, 'rooms/room-a/messages/1.json'))).toBe(true);

    await store.archiveRoom('room-a', '2026-08-14T00:00:00.000Z');
    // Archiving closes every session, so nothing is owed and the page goes.
    expect(existsSync(path.join(dir, 'rooms/room-a/messages/1.json'))).toBe(false);
    expect((await store.readRoom('room-a'))?.archivedAt).toBe('2026-08-14T00:00:00.000Z');
    const index = JSON.parse(await readFile(path.join(dir, 'rooms/index.json'), 'utf8'));
    expect(index.rooms).toHaveLength(1);
  });

  it('rejects a crafted room id before any file is touched', async () => {
    const store = createRoomStore(makeCtx());
    const escaped = roomFixture('room-a');
    escaped.definition.id = '../escape';
    await expect(store.updateState((s) => ({ ...s, rooms: [escaped] }))).rejects.toThrow(
      /unsafe room path segment/,
    );
    expect(existsSync(path.join(path.dirname(dir), 'escape'))).toBe(false);
  });

  it('a failed write does not poison later writes', async () => {
    const store = createRoomStore(makeCtx());
    await store.updateState((s) => ({ ...s, rooms: [roomFixture('room-a')] }));
    await expect(store.updateRoom('missing', (r) => r)).rejects.toThrow(/unknown room/);
    await store.updateMember('room-a', 'm1', (m) => ({ ...m, status: 'working' }));
    expect((await store.readRoom('room-a'))?.members[0].status).toBe('working');
  });
});
