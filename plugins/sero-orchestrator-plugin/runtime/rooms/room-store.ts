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
  withAdvancedCursor,
  withAppendedMessages,
  type RoomMessageDraft,
} from './room-messages';
import { createRoomPaths } from './room-paths';
import {
  DEFAULT_ROOM_RETENTION,
  ROOM_SCHEMA_VERSION,
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
  /** Paged read for the UI, forward from `afterSequence` (exclusive). */
  readMessages(roomId: string, afterSequence: number, limit: number): Promise<RoomMessage[]>;
  /** Reads a member's undelivered messages and advances its cursor in one write. */
  takeMessagesFor(roomId: string, memberId: string, limit: number): Promise<RoomMessage[]>;
  hasAppliedCommand(roomId: string, commandId: string): Promise<boolean>;
  recordAppliedCommand(roomId: string, commandId: string): Promise<void>;
  /** Applies a command once: returns false when `commandId` was already applied. */
  applyCommand(roomId: string, commandId: string, updater: (record: RoomRecord) => RoomRecord): Promise<boolean>;
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
    if (index.schemaVersion !== ROOM_SCHEMA_VERSION) await writeJson(paths.index, buildRoomIndex(state));
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

  /** Cursor upkeep is the one normalization every write path shares. */
  async function commit(prev: RoomState, next: RoomState): Promise<void> {
    const normalized = { ...next, rooms: next.rooms.map(withMemberCursors) };
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

  async function applyRetention(roomId: string): Promise<void> {
    await serialize(async () => {
      const prev = await ensureLoaded();
      const record = requireRoom(prev, roomId);
      await messages.prune(roomId, record.runtime.messageSequence, retention.maxMessagePages);
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

    appendMessages: (roomId, drafts) =>
      serialize(async () => {
        const prev = await ensureLoaded();
        const record = requireRoom(prev, roomId);
        const base = record.runtime.messageSequence;
        const written = assignSequences(roomId, drafts, base);
        if (written.length === 0) return written;
        // Pages first: a crash must never leave the Room's sequence pointing at
        // a message that was never persisted.
        await messages.write(roomId, written);
        const latest = written[written.length - 1].sequence;
        await commit(prev, mapRoom(prev, roomId, (room) => withAppendedMessages(room, written)));
        if (messagePageOf(latest) > messagePageOf(base)) {
          await messages.prune(roomId, latest, retention.maxMessagePages);
        }
        return written;
      }),

    readMessages: async (roomId, afterSequence, limit) => {
      const record = requireRoom(await ensureLoaded(), roomId);
      return messages.read(roomId, afterSequence, record.runtime.messageSequence, limit);
    },

    takeMessagesFor: (roomId, memberId, limit) =>
      serialize(async () => {
        const prev = await ensureLoaded();
        const record = requireRoom(prev, roomId);
        const cursor = record.readCursors.find((candidate) => candidate.memberId === memberId);
        // A zero limit reads nothing, so the cursor must not move — without this
        // the "drained" test below would treat an empty read as a full scan.
        if (!cursor || limit <= 0) return [];
        const latest = record.runtime.messageSequence;
        const taken = await messages.read(roomId, cursor.lastReadSequence, latest, limit, (message) =>
          addressesMember(message, memberId),
        );
        // Short of the limit means everything up to `latest` was scanned, so the
        // cursor jumps past the messages this member was never addressed in.
        const drained = taken.length < limit;
        const lastRead = drained ? latest : taken[taken.length - 1].sequence;
        const pending = drained ? 0 : Math.max(0, cursor.pendingCount - taken.length);
        await commit(prev, mapRoom(prev, roomId, (room) => withAdvancedCursor(room, memberId, lastRead, pending)));
        return taken;
      }),

    hasAppliedCommand: async (roomId, commandId) =>
      requireRoom(await ensureLoaded(), roomId).runtime.appliedCommandIds.includes(commandId),

    recordAppliedCommand: (roomId, commandId) =>
      updateRoom(roomId, (record) => withAppliedCommand(record, commandId)),

    applyCommand: (roomId, commandId, updater) =>
      serialize(async () => {
        const prev = await ensureLoaded();
        const record = requireRoom(prev, roomId);
        if (record.runtime.appliedCommandIds.includes(commandId)) return false;
        await commit(prev, mapRoom(prev, roomId, (room) => withAppliedCommand(updater(room), commandId)));
        return true;
      }),

    appendTimeline: (roomId, events) => timeline.append(roomId, events),

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
