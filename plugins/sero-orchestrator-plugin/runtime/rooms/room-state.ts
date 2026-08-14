/**
 * Pure helpers for the Room split-persistence layout (one dir per Room + a
 * small watched index), mirroring `runtime/store.ts` for Workflow loops. The
 * store does the file I/O around these; keeping compose, summarize and diff
 * pure makes them directly testable.
 *
 * Rooms are diffed by REFERENCE: writers update state immutably and keep
 * unchanged Rooms by reference, so one Room's write never rewrites another's
 * files. Members are diffed by VALUE, because `readState` hands out clones and
 * a member map/spread produces fresh objects for members that did not change.
 */

import type { RoomAttention } from '../../shared/attention-types';
import type {
  MemberReadCursor,
  PathClaim,
  RoomApprovalRequest,
  RoomArtifact,
  RoomRevision,
  WorkItem,
} from '../../shared/room-message-types';
import type { Room, RoomIndex, RoomMember, RoomSummary } from '../../shared/room-types';
// The inbox owns what an approval entry says; the summary only carries it.
import { toRoomAttention } from './room-delivery';

/** Bumped whenever the persisted Room shape changes. See room-migrations.ts. */
export const ROOM_SCHEMA_VERSION = 1;

/**
 * Applied command ids kept per Room for idempotency (NFR-003). Bounded so a
 * long-running Room cannot grow its runtime record without limit; a replay
 * older than this window is far outside any retry horizon.
 */
export const MAX_APPLIED_COMMAND_IDS = 200;

/** How much per-Room history survives retention. */
export interface RoomRetention {
  /** Message pages kept on disk (MESSAGE_PAGE_SIZE messages each). */
  maxMessagePages: number;
  /** Accepted revisions kept in revisions.json. */
  maxRevisions: number;
  /** Bytes the active timeline file may reach before it rotates. */
  maxTimelineBytes: number;
  /** Rotated timeline files kept beside the active one. */
  maxTimelineFiles: number;
}

export const DEFAULT_ROOM_RETENTION: RoomRetention = {
  maxMessagePages: 20,
  maxRevisions: 200,
  maxTimelineBytes: 1_000_000,
  maxTimelineFiles: 2,
};

/**
 * The in-memory Room: the domain record plus the two lists the store keeps
 * beside it. Revisions get their own file so room.json stays bounded; read
 * cursors persist with the Room rather than with the member, because they are
 * positions in the Room's own message sequence.
 */
export interface RoomRecord extends Room {
  revisions: RoomRevision[];
  readCursors: MemberReadCursor[];
  /**
   * Pending and resolved approval requests. Kept on the record rather than in
   * their own file because the UI's inbox reads them with the Room, and a Room
   * has few of them — unlike messages, which page.
   */
  approvals: RoomApprovalRequest[];
  /**
   * Work, artifacts and path claims live with the Room for the same reason
   * approvals do: they are few, they are read together with the Room, and every
   * one of them is bounded (§19.1–§19.3). Messages page into their own files
   * because they are the one list that grows without limit.
   */
  work: WorkItem[];
  artifacts: RoomArtifact[];
  claims: PathClaim[];
}

/**
 * room.json: the Room minus the parts stored in their own files. `memberIds`
 * carries the roster order, so members reassemble in the order they joined.
 */
export type PersistedRoom = Omit<RoomRecord, 'members' | 'revisions'> & { memberIds: string[] };

export interface RoomState {
  schemaVersion: number;
  rooms: RoomRecord[];
}

export function composeRoomState(rooms: RoomRecord[]): RoomState {
  return { schemaVersion: ROOM_SCHEMA_VERSION, rooms };
}

export function stripRoomForPersist(record: RoomRecord): PersistedRoom {
  return {
    definition: record.definition,
    runtime: record.runtime,
    brief: record.brief,
    delivery: record.delivery,
    archivedAt: record.archivedAt,
    readCursors: record.readCursors,
    approvals: record.approvals,
    work: record.work,
    artifacts: record.artifacts,
    claims: record.claims,
    memberIds: record.members.map((member) => member.id),
  };
}

export function reassembleRoom(
  persisted: PersistedRoom,
  members: RoomMember[],
  revisions: RoomRevision[],
): RoomRecord {
  return {
    definition: persisted.definition,
    runtime: persisted.runtime,
    brief: persisted.brief,
    delivery: persisted.delivery,
    archivedAt: persisted.archivedAt,
    readCursors: persisted.readCursors,
    // `?? []` rather than a migration step: these lists were added to a shape
    // that was already on disk, and an absent list means "none", not damage.
    approvals: persisted.approvals ?? [],
    work: persisted.work ?? [],
    artifacts: persisted.artifacts ?? [],
    claims: persisted.claims ?? [],
    members,
    revisions,
  };
}

/**
 * Everything the user must act on: the pending approvals themselves, plus a
 * Room stopped waiting for one. Counted from `approvals` rather than from
 * revisions held for approval, because a delivery approval has no revision and
 * a badge that disagrees with the inbox below it is worse than no badge.
 */
function toAttentionCount(record: RoomRecord, attention: RoomAttention | undefined): number {
  return (attention?.approvals.length ?? 0) + (record.runtime.stopReason?.kind === 'awaiting-approval' ? 1 : 0);
}

export function toRoomSummary(record: RoomRecord): RoomSummary {
  const attention = toRoomAttention(record);
  return {
    id: record.definition.id,
    title: record.definition.title,
    status: record.runtime.status,
    memberCount: record.members.length,
    activeMemberCount: record.runtime.activeMemberIds.length,
    costUsd: record.runtime.usage.costUsd,
    maxCostUsd: record.definition.envelope.maxCostUsd,
    startedAt: record.runtime.startedAt,
    updatedAt: record.definition.updatedAt,
    attentionCount: toAttentionCount(record, attention),
    attention,
  };
}

/**
 * Archived Rooms stay in the index: it is the list `load()` enumerates, so
 * dropping an entry would drop the Room from state on the next start.
 */
export function buildRoomIndex(state: RoomState): RoomIndex {
  return { schemaVersion: ROOM_SCHEMA_VERSION, rooms: state.rooms.map(toRoomSummary) };
}

export interface MembersDiff {
  /** Members to (over)write — new or value-changed. */
  changed: RoomMember[];
  /** Member ids present before but gone now. */
  removedIds: string[];
}

export function diffMembers(prev: RoomMember[], next: RoomMember[]): MembersDiff {
  const prevById = new Map(prev.map((member) => [member.id, JSON.stringify(member)]));
  const changed = next.filter((member) => prevById.get(member.id) !== JSON.stringify(member));
  const nextIds = new Set(next.map((member) => member.id));
  const removedIds = prev.filter((member) => !nextIds.has(member.id)).map((member) => member.id);
  return { changed, removedIds };
}

export interface RoomStateDiff {
  /** Rooms to (over)write — changed by reference or newly added. */
  changed: RoomRecord[];
  /** Room ids whose directories should be removed. */
  removedIds: string[];
  /** Whether the summary index needs rewriting. */
  indexChanged: boolean;
}

export function diffRoomState(prev: RoomState, next: RoomState): RoomStateDiff {
  const prevById = new Map(prev.rooms.map((room) => [room.definition.id, room]));
  const changed = next.rooms.filter((room) => prevById.get(room.definition.id) !== room);
  const nextIds = new Set(next.rooms.map((room) => room.definition.id));
  const removedIds = prev.rooms.filter((room) => !nextIds.has(room.definition.id)).map((room) => room.definition.id);
  const indexChanged = JSON.stringify(buildRoomIndex(prev)) !== JSON.stringify(buildRoomIndex(next));
  return { changed, removedIds, indexChanged };
}

/**
 * Keeps exactly one read cursor per current member. A member that joins
 * mid-Room starts at the current sequence, so it never inherits a backlog it
 * was not part of; a member whose record is gone loses its cursor, so the list
 * stays bounded by the roster. Returns the same reference when nothing moves,
 * which is what keeps the reference diff honest.
 */
export function withMemberCursors(record: RoomRecord): RoomRecord {
  const byId = new Map(record.readCursors.map((cursor) => [cursor.memberId, cursor]));
  const readCursors = record.members.map(
    (member) =>
      byId.get(member.id) ?? {
        memberId: member.id,
        lastReadSequence: record.runtime.messageSequence,
        pendingCount: 0,
      },
  );
  const unchanged =
    readCursors.length === record.readCursors.length &&
    readCursors.every((cursor, i) => cursor === record.readCursors[i]);
  return unchanged ? record : { ...record, readCursors };
}

/** Records an applied command id, keeping the list bounded and duplicate-free. */
export function withAppliedCommand(record: RoomRecord, commandId: string): RoomRecord {
  const applied = record.runtime.appliedCommandIds.filter((id) => id !== commandId);
  applied.push(commandId);
  return {
    ...record,
    runtime: { ...record.runtime, appliedCommandIds: applied.slice(-MAX_APPLIED_COMMAND_IDS) },
  };
}
