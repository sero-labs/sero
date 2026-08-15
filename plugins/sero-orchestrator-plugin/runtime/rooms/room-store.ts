/**
 * File-backed Room store: keeps an in-memory RoomState cache and splits each
 * Room across small files so run-time writes stay cheap and bounded
 * (architecture.md §2.3):
 *   rooms/index.json                    — room summaries (watched by the UI)
 *   rooms/<roomId>/room.json            — definition, runtime, brief, delivery
 *   rooms/<roomId>/members/<id>.json    — one file per member
 *   rooms/<roomId>/messages/<page>.json — durable message pages
 *   rooms/<roomId>/revisions.json       — accepted revision history
 *   rooms/<roomId>/timeline.jsonl       — append-only audit timeline
 *
 * The in-memory `RoomRecord` is reassembled on read, so coordinator logic never
 * sees the layout. The runtime is the single writer, so the cache is
 * authoritative and writes are serialized. A member's frequent status write
 * touches only that member file plus the index — never the whole Room, and
 * never another Room. Current records are the source of truth: state is never
 * rebuilt from the timeline (FR-030).
 */

import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { AppRuntimeContext } from '@sero-ai/common';
import type { RoomMessage, RoomRevision, RoomTimelineEvent } from '../../shared/room-message-types';
import type { RoomIndex, RoomMember } from '../../shared/room-types';
import { migrateRoomRecord } from './room-migrations';
import {
  addressesMember,
  assignSequences,
  createMessageLog,
  messagePageOf,
  undeliveredFloor,
  withAcknowledgedLease,
  withAdvancedCursor,
  withAppendedMessages,
  withLease,
  type RoomMessageDraft,
} from './room-messages';
import { createRoomPaths } from './room-paths';
import {
  DEFAULT_ROOM_RETENTION,
  buildRoomIndex,
  composeRoomState,
  diffMembers,
  diffRoomState,
  reassembleRoom,
  stripRoomForPersist,
  withAppliedCommand,
  withMemberCursors,
  type PersistedRoom,
  type RoomRecord,
  type RoomRetention,
  type RoomState,
} from './room-state';
import { createRoomTimeline } from './room-timeline';

/** What a `transact` decision produced: the record to persist, and its answer. */
export interface RoomTransaction<T> {
  /** The record to write, or null when the decision was to change nothing. */
  record: RoomRecord | null;
  result: T;
}

export type RoomTransactionOutcome<T> = { duplicate: true } | { duplicate: false; result: T };

/** A batch of messages held for one turn, and the cursor position it commits. */
export interface LeasedMessages {
  messages: RoomMessage[];
  /** Hand this back to `acknowledgeMessages` once the turn has taken the batch. */
  throughSequence: number;
}

export interface RoomStore {
  /** Absolute path of the watched index — the only file the UI subscribes to. */
  readonly indexFile: string;
  readState(): Promise<RoomState>;
  updateState(updater: (current: RoomState) => RoomState): Promise<void>;
  readRoom(roomId: string): Promise<RoomRecord | null>;
  readMember(roomId: string, memberId: string): Promise<RoomMember | null>;
  readRevisions(roomId: string): Promise<RoomRevision[]>;
  updateRoom(roomId: string, updater: (record: RoomRecord) => RoomRecord): Promise<void>;
  updateMember(roomId: string, memberId: string, updater: (member: RoomMember) => RoomMember): Promise<void>;
  /** Persists messages, assigns their sequences, and raises recipient pending counts. */
  appendMessages(roomId: string, drafts: RoomMessageDraft[]): Promise<RoomMessage[]>;
  /**
   * `appendMessages` plus the command key, claimed in the SAME state write.
   * Null when the key was already applied. Two writes would let a crash burn a
   * key whose messages were never persisted, and the retry would be answered
   * "already sent" with nothing in the log.
   */
  appendMessagesOnce(
    roomId: string,
    commandId: string,
    drafts: RoomMessageDraft[],
  ): Promise<RoomMessage[] | null>;
  /** Paged read for the UI, forward from `afterSequence` (exclusive). */
  readMessages(roomId: string, afterSequence: number, limit: number): Promise<RoomMessage[]>;
  /**
   * Hands a member its undelivered messages WITHOUT advancing its cursor. The
   * batch is recorded as a lease instead, and only `acknowledgeMessages` moves
   * the cursor onto it. An open lease is handed over again on the next call, so
   * a turn that never took its prompt costs a repeat rather than the messages.
   */
  leaseMessagesFor(roomId: string, memberId: string, limit: number): Promise<LeasedMessages>;
  /**
   * Commits the lease taken at `throughSequence`. A lease at any other position
   * belongs to a different turn and is left alone — committing it would move
   * the cursor past messages that turn is still holding.
   */
  acknowledgeMessages(roomId: string, memberId: string, throughSequence: number): Promise<void>;
  hasAppliedCommand(roomId: string, commandId: string): Promise<boolean>;
  /** Applies a command once: returns false when `commandId` was already applied. */
  applyCommand(roomId: string, commandId: string, updater: (record: RoomRecord) => RoomRecord): Promise<boolean>;
  /**
   * Decides AND writes inside one serialized turn.
   *
   * `decide` sees the record no other writer can move underneath it, and
   * whatever it returns is persisted before the next writer runs — so a
   * decision can never be made against a state that no longer holds by the time
   * it lands. That is the difference between "validate, then apply" and
   * "validate, then apply to something else".
   *
   * The command key is claimed in the same write, and only when `decide`
   * actually wrote something: a refusal must not burn the caller's retry.
   */
  transact<T>(
    roomId: string,
    commandId: string | null,
    decide: (record: RoomRecord) => RoomTransaction<T>,
  ): Promise<RoomTransactionOutcome<T>>;
  appendTimeline(roomId: string, events: RoomTimelineEvent[]): Promise<void>;
  readTimeline(roomId: string, limit: number): Promise<RoomTimelineEvent[]>;
  /** Marks the Room archived and reclaims its retained history. Session files are kept (D-12). */
  archiveRoom(roomId: string, at: string): Promise<void>;
  applyRetention(roomId: string): Promise<void>;
  /** Removes `rooms/<roomId>/` entirely. Session files and the grant are the coordinator's (D-12). */
  deleteRoom(roomId: string): Promise<void>;
}

function requireRoom(state: RoomState, roomId: string): RoomRecord {
  const record = state.rooms.find((room) => room.definition.id === roomId);
  if (!record) throw new Error(`unknown room: ${roomId}`);
  return record;
}

export function createRoomStore(
  ctx: AppRuntimeContext,
  retention: RoomRetention = DEFAULT_ROOM_RETENTION,
): RoomStore {
  const paths = createRoomPaths(path.dirname(ctx.stateFilePath));
  const messages = createMessageLog(ctx.host.appState, paths);
  const timeline = createRoomTimeline(paths, retention);

  let cache: RoomState | null = null;
  let loadPromise: Promise<RoomState> | null = null;
  let tail: Promise<unknown> = Promise.resolve();

  const readJson = <T>(file: string) => ctx.host.appState.read<T>(file);
  // Atomic write that also triggers the file watcher the UI subscribes to.
  const writeJson = <T>(file: string, data: T) => ctx.host.appState.update<T>(file, () => data);

  /** Writes every file for a Room (initial create, migration, or full rewrite). */
  async function persistRoomFull(record: RoomRecord): Promise<void> {
    const roomId = record.definition.id;
    for (const member of record.members) await writeJson(paths.member(roomId, member.id), member);
    if (record.revisions.length) await writeJson(paths.revisions(roomId), record.revisions);
    // room.json last: it carries the roster order, so a reader that sees a
    // member id can always resolve the member file it points at.
    await writeJson(paths.room(roomId), stripRoomForPersist(record));
  }

  /** Writes only the parts of a Room that actually changed since `prev`. */
  async function persistRoomDiff(prev: RoomRecord | undefined, next: RoomRecord): Promise<void> {
    if (!prev) return persistRoomFull(next);
    const roomId = next.definition.id;
    const members = diffMembers(prev.members, next.members);
    for (const member of members.changed) await writeJson(paths.member(roomId, member.id), member);
    for (const memberId of members.removedIds) await rm(paths.member(roomId, memberId), { force: true });
    if (JSON.stringify(prev.revisions) !== JSON.stringify(next.revisions)) {
      await writeJson(paths.revisions(roomId), next.revisions);
    }
    const persisted = stripRoomForPersist(next);
    if (JSON.stringify(stripRoomForPersist(prev)) !== JSON.stringify(persisted)) {
      await writeJson(paths.room(roomId), persisted);
    }
  }

  async function persistDiff(prev: RoomState, next: RoomState): Promise<void> {
    const { changed, removedIds, indexChanged } = diffRoomState(prev, next);
    const prevById = new Map(prev.rooms.map((room) => [room.definition.id, room]));
    for (const record of changed) await persistRoomDiff(prevById.get(record.definition.id), record);
    for (const roomId of removedIds) {
      await rm(paths.roomDir(roomId), { recursive: true, force: true });
      timeline.forget(roomId);
    }
    if (indexChanged) await writeJson(paths.index, buildRoomIndex(next));
  }

  async function load(): Promise<RoomState> {
    const index = await readJson<RoomIndex>(paths.index);
    if (!index?.rooms) return composeRoomState([]);
    const rooms: RoomRecord[] = [];
    for (const summary of index.rooms) {
      const persisted = await readJson<PersistedRoom>(paths.room(summary.id));
      if (!persisted) continue;
      const members: RoomMember[] = [];
      for (const memberId of persisted.memberIds) {
        const member = await readJson<RoomMember>(paths.member(summary.id, memberId));
        if (member) members.push(member);
      }
      const revisions = (await readJson<RoomRevision[]>(paths.revisions(summary.id))) ?? [];
      const record = reassembleRoom(persisted, members, revisions);
      const migrated = migrateRoomRecord(record, index.schemaVersion);
      if (migrated !== record) await persistRoomFull(migrated);
      rooms.push(migrated);
    }
    const state = composeRoomState(rooms);
    // The index is a projection of the records, and it is what the home inbox
    // and the Rooms list read. Rebuilding it here — and writing only when it
    // actually differs — means a Room written by an older build cannot leave a
    // stale summary on screen for ever: a paused Room that needed the user
    // stayed out of the inbox until something happened to touch its record.
    const rebuilt = buildRoomIndex(state);
    if (JSON.stringify(rebuilt) !== JSON.stringify(index)) await writeJson(paths.index, rebuilt);
    return state;
  }

  async function ensureLoaded(): Promise<RoomState> {
    if (cache) return cache;
    loadPromise ??= load();
    cache = await loadPromise;
    return cache;
  }

  // Serialize writes; a failure does not poison the queue for later writes.
  function serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task, task);
    tail = result.then(() => undefined, () => undefined);
    return result;
  }

  /**
   * `statusAt` upkeep: a member entering a new status gets stamped here, at
   * the one seam every write shares — no write site can forget it. Staying in
   * a status keeps the stamp; new members keep what their creation site set.
   */
  function withStatusStamps(room: RoomRecord, prev: RoomState): RoomRecord {
    const prevRoom = prev.rooms.find((candidate) => candidate.definition.id === room.definition.id);
    if (!prevRoom || prevRoom.members === room.members) return room;
    const before = new Map(prevRoom.members.map((member) => [member.id, member]));
    return {
      ...room,
      members: room.members.map((member) => {
        const was = before.get(member.id);
        return !was || was.status === member.status
          ? member
          : { ...member, statusAt: new Date().toISOString() };
      }),
    };
  }

  /** The normalizations every write path shares: cursors, then statusAt. */
  async function commit(prev: RoomState, next: RoomState): Promise<void> {
    const normalized = {
      ...next,
      rooms: next.rooms.map((room) => withMemberCursors(withStatusStamps(room, prev))),
    };
    await persistDiff(prev, normalized);
    cache = normalized;
  }

  function mapRoom(state: RoomState, roomId: string, fn: (record: RoomRecord) => RoomRecord): RoomState {
    return {
      ...state,
      rooms: state.rooms.map((room) => (room.definition.id === roomId ? fn(room) : room)),
    };
  }

  function updateRoom(roomId: string, updater: (record: RoomRecord) => RoomRecord): Promise<void> {
    return serialize(async () => {
      const prev = await ensureLoaded();
      requireRoom(prev, roomId);
      await commit(prev, mapRoom(prev, roomId, updater));
    });
  }

  function transact<T>(
    roomId: string,
    commandId: string | null,
    decide: (record: RoomRecord) => RoomTransaction<T>,
  ): Promise<RoomTransactionOutcome<T>> {
    return serialize<RoomTransactionOutcome<T>>(async () => {
      const prev = await ensureLoaded();
      const record = requireRoom(prev, roomId);
      if (commandId && record.runtime.appliedCommandIds.includes(commandId)) return { duplicate: true };
      const decision = decide(record);
      if (decision.record) {
        const written = commandId
          ? withAppliedCommand(decision.record, commandId, retention.maxAppliedCommandIds)
          : decision.record;
        await commit(prev, mapRoom(prev, roomId, () => written));
      }
      return { duplicate: false, result: decision.result };
    });
  }

  /** Pages first, then ONE state write carrying the sequence bump and the key. */
  function writeMessages(
    roomId: string,
    commandId: string | null,
    drafts: RoomMessageDraft[],
  ): Promise<RoomMessage[] | null> {
    return serialize<RoomMessage[] | null>(async () => {
      const prev = await ensureLoaded();
      const record = requireRoom(prev, roomId);
      if (commandId && record.runtime.appliedCommandIds.includes(commandId)) return null;
      const base = record.runtime.messageSequence;
      const written = assignSequences(roomId, drafts, base);
      if (written.length === 0) return written;
      // Pages first: a crash must never leave the Room's sequence pointing at
      // a message that was never persisted.
      await messages.write(roomId, written);
      const latest = written[written.length - 1].sequence;
      await commit(
        prev,
        mapRoom(prev, roomId, (room) => {
          const appended = withAppendedMessages(room, written);
          return commandId
            ? withAppliedCommand(appended, commandId, retention.maxAppliedCommandIds)
            : appended;
        }),
      );
      if (messagePageOf(latest) > messagePageOf(base)) {
        // Cursors are untouched by an append, so the record read above still
        // names the oldest message anybody is owed.
        await messages.prune(roomId, latest, retention.maxMessagePages, undeliveredFloor(record, latest));
      }
      return written;
    });
  }

  async function applyRetention(roomId: string): Promise<void> {
    await serialize(async () => {
      const prev = await ensureLoaded();
      const record = requireRoom(prev, roomId);
      // An archived Room is over: its sessions are closed and no member can ever
      // read again, so the delivery floor that protects a live Room would only
      // pin history nobody can reach. A live Room keeps every page it still owes.
      await messages.prune(
        roomId,
        record.runtime.messageSequence,
        retention.maxMessagePages,
        record.archivedAt ? record.runtime.messageSequence : undeliveredFloor(record, record.runtime.messageSequence),
      );
      const revisions = record.revisions.slice(-retention.maxRevisions);
      if (revisions.length === record.revisions.length) return;
      await commit(prev, mapRoom(prev, roomId, (room) => ({ ...room, revisions })));
    });
  }

  return {
    indexFile: paths.index,

    readState: async () => structuredClone(await ensureLoaded()),

    updateState: (updater) =>
      serialize(async () => {
        const prev = await ensureLoaded();
        await commit(prev, updater(prev));
      }),

    readRoom: async (roomId) => {
      const record = (await ensureLoaded()).rooms.find((room) => room.definition.id === roomId);
      return record ? structuredClone(record) : null;
    },

    readMember: async (roomId, memberId) => {
      const record = (await ensureLoaded()).rooms.find((room) => room.definition.id === roomId);
      const member = record?.members.find((candidate) => candidate.id === memberId);
      return member ? structuredClone(member) : null;
    },

    readRevisions: async (roomId) => structuredClone(requireRoom(await ensureLoaded(), roomId).revisions),

    updateRoom,

    updateMember: (roomId, memberId, updater) =>
      updateRoom(roomId, (record) => ({
        ...record,
        members: record.members.map((member) => (member.id === memberId ? updater(member) : member)),
      })),

    appendMessages: async (roomId, drafts) => (await writeMessages(roomId, null, drafts)) ?? [],

    appendMessagesOnce: (roomId, commandId, drafts) => writeMessages(roomId, commandId, drafts),

    readMessages: async (roomId, afterSequence, limit) => {
      const record = requireRoom(await ensureLoaded(), roomId);
      return messages.read(roomId, afterSequence, record.runtime.messageSequence, limit);
    },

    leaseMessagesFor: (roomId, memberId, limit) =>
      serialize<LeasedMessages>(async () => {
        const prev = await ensureLoaded();
        const record = requireRoom(prev, roomId);
        const cursor = record.readCursors.find((candidate) => candidate.memberId === memberId);
        // A zero limit reads nothing, so the cursor must not move — without this
        // the "drained" test below would treat an empty read as a full scan.
        if (!cursor || limit <= 0) return { messages: [], throughSequence: cursor?.lastReadSequence ?? 0 };
        const reaches = (message: RoomMessage): boolean => addressesMember(message, memberId);

        const open = cursor.lease;
        if (open) {
          // A batch nobody acknowledged. The cursor never moved, so reading the
          // same window returns the same messages — this is the replay.
          const held = await messages.read(roomId, cursor.lastReadSequence, open.throughSequence, limit, reaches);
          return { messages: held, throughSequence: open.throughSequence };
        }

        const latest = record.runtime.messageSequence;
        const taken = await messages.read(roomId, cursor.lastReadSequence, latest, limit, reaches);
        // Short of the limit means everything up to `latest` was scanned, so the
        // cursor jumps past the messages this member was never addressed in.
        const drained = taken.length < limit;
        const throughSequence = drained ? latest : taken[taken.length - 1].sequence;
        const pendingCount = drained ? 0 : Math.max(0, cursor.pendingCount - taken.length);
        await commit(
          prev,
          mapRoom(prev, roomId, (room) =>
            // Nothing was handed over, so there is nothing to lose and nothing to
            // replay: skipping past unaddressed messages commits immediately.
            taken.length === 0
              ? withAdvancedCursor(room, memberId, throughSequence, pendingCount)
              : withLease(room, memberId, { throughSequence, pendingCount }),
          ),
        );
        return { messages: taken, throughSequence };
      }),

    acknowledgeMessages: (roomId, memberId, throughSequence) =>
      serialize(async () => {
        const prev = await ensureLoaded();
        const record = requireRoom(prev, roomId);
        const cursor = record.readCursors.find((candidate) => candidate.memberId === memberId);
        if (cursor?.lease?.throughSequence !== throughSequence) return;
        await commit(prev, mapRoom(prev, roomId, (room) => withAcknowledgedLease(room, memberId)));
      }),

    hasAppliedCommand: async (roomId, commandId) =>
      requireRoom(await ensureLoaded(), roomId).runtime.appliedCommandIds.includes(commandId),

    applyCommand: async (roomId, commandId, updater) => {
      const outcome = await transact(roomId, commandId, (record) => ({
        record: updater(record),
        result: true,
      }));
      return !outcome.duplicate;
    },

    transact,

    // Serialized like every other write: the timeline shares the state
    // directory, and an unserialized append can interleave with a room write
    // and lose events under concurrency.
    appendTimeline: (roomId, events) =>
      serialize(async () => {
        await timeline.append(roomId, events);
        // The panel watches room.json, so an append that left the record
        // untouched would never reach it. Nested `serialize` would deadlock,
        // hence the inline commit.
        const prev = await ensureLoaded();
        if (!prev.rooms.some((room) => room.definition.id === roomId)) return;
        await commit(
          prev,
          mapRoom(prev, roomId, (room) => ({
            ...room,
            runtime: { ...room.runtime, timelineSequence: room.runtime.timelineSequence + events.length },
          })),
        );
      }),

    readTimeline: (roomId, limit) => timeline.read(roomId, limit),

    async archiveRoom(roomId, at) {
      await updateRoom(roomId, (record) => ({ ...record, archivedAt: at }));
      await applyRetention(roomId);
    },

    applyRetention,

    deleteRoom: (roomId) =>
      serialize(async () => {
        const prev = await ensureLoaded();
        const rooms = prev.rooms.filter((room) => room.definition.id !== roomId);
        await commit(prev, { ...prev, rooms });
      }),
  };
}
