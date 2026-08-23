import { rm } from 'node:fs/promises';
import type { RoomRevision } from '../../shared/room-message-types';
import type { RoomIndex, RoomMember } from '../../shared/room-types';
import { migrateRoomRecord } from './room-migrations';
import type { RoomPaths } from './room-paths';
import {
  buildRoomIndex,
  composeRoomState,
  diffMembers,
  diffRoomState,
  reassembleRoom,
  stripRoomForPersist,
  type PersistedRoom,
  type RoomRecord,
  type RoomState,
} from './room-state';

type WriteOperation = { kind: 'write'; file: string; data: unknown };
type DeleteOperation = { kind: 'delete'; file: string; recursive: boolean };
type PersistenceOperation = WriteOperation | DeleteOperation;

interface RoomTransactionJournal {
  version: 1;
  operations: PersistenceOperation[];
}

interface PersistenceIo {
  readJson<T>(file: string): Promise<T | null>;
  writeJson<T>(file: string, data: T): Promise<void>;
}

/** Owns split-file writes and replays an interrupted transaction on startup. */
export function createRoomPersistence(paths: RoomPaths, io: PersistenceIo) {
  const write = (file: string, data: unknown): WriteOperation => ({ kind: 'write', file, data });

  function roomFull(record: RoomRecord): PersistenceOperation[] {
    const roomId = record.definition.id;
    return [
      ...record.members.map((member) => write(paths.member(roomId, member.id), member)),
      write(paths.revisions(roomId), record.revisions),
      write(paths.room(roomId), stripRoomForPersist(record)),
    ];
  }

  function roomDiff(prev: RoomRecord | undefined, next: RoomRecord): PersistenceOperation[] {
    if (!prev) return roomFull(next);
    const roomId = next.definition.id;
    const members = diffMembers(prev.members, next.members);
    const operations: PersistenceOperation[] = [
      ...members.changed.map((member) => write(paths.member(roomId, member.id), member)),
      ...members.removedIds.map((memberId): DeleteOperation => ({
        kind: 'delete', file: paths.member(roomId, memberId), recursive: false,
      })),
    ];
    if (JSON.stringify(prev.revisions) !== JSON.stringify(next.revisions)) {
      operations.push(write(paths.revisions(roomId), next.revisions));
    }
    const persisted = stripRoomForPersist(next);
    if (JSON.stringify(stripRoomForPersist(prev)) !== JSON.stringify(persisted)) {
      operations.push(write(paths.room(roomId), persisted));
    }
    return operations;
  }

  function stateDiff(prev: RoomState, next: RoomState): PersistenceOperation[] {
    const { changed, removedIds, indexChanged } = diffRoomState(prev, next);
    const prevById = new Map(prev.rooms.map((room) => [room.definition.id, room]));
    const operations = changed.flatMap((record) => roomDiff(prevById.get(record.definition.id), record));
    operations.push(...removedIds.map((roomId): DeleteOperation => ({
      kind: 'delete', file: paths.roomDir(roomId), recursive: true,
    })));
    if (indexChanged) operations.push(write(paths.index, buildRoomIndex(next)));
    return operations;
  }

  async function apply(operations: PersistenceOperation[]): Promise<void> {
    for (const operation of operations) {
      if (operation.kind === 'write') await io.writeJson(operation.file, operation.data);
      else await rm(operation.file, { recursive: operation.recursive, force: true });
    }
  }

  async function load(): Promise<RoomState> {
    const journal = await io.readJson<RoomTransactionJournal>(paths.transaction);
    if (journal?.version === 1) {
      await apply(journal.operations);
      await rm(paths.transaction, { force: true });
    }
    const index = await io.readJson<RoomIndex>(paths.index);
    if (!index?.rooms) return composeRoomState([]);
    const rooms: RoomRecord[] = [];
    for (const summary of index.rooms) {
      const persisted = await io.readJson<PersistedRoom>(paths.room(summary.id));
      if (!persisted) continue;
      const members: RoomMember[] = [];
      for (const memberId of persisted.memberIds) {
        const member = await io.readJson<RoomMember>(paths.member(summary.id, memberId));
        if (member) members.push(member);
      }
      const revisions = (await io.readJson<RoomRevision[]>(paths.revisions(summary.id))) ?? [];
      const record = reassembleRoom(persisted, members, revisions);
      const migrated = migrateRoomRecord(record, index.schemaVersion);
      if (migrated !== record) await apply(roomFull(migrated));
      rooms.push(migrated);
    }
    const state = composeRoomState(rooms);
    const rebuilt = buildRoomIndex(state);
    if (JSON.stringify(rebuilt) !== JSON.stringify(index)) await io.writeJson(paths.index, rebuilt);
    return state;
  }

  async function commit(prev: RoomState, next: RoomState): Promise<void> {
    const operations = stateDiff(prev, next);
    if (operations.length === 0) return;
    await io.writeJson<RoomTransactionJournal>(paths.transaction, { version: 1, operations });
    await apply(operations);
    await rm(paths.transaction, { force: true });
  }

  return { commit, load };
}
