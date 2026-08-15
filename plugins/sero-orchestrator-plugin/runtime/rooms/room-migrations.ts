import { ROOM_SCHEMA_VERSION, type RoomRecord } from './room-state';

/** Upgrades one persisted Room record by a single schema version. */
type RoomMigration = (record: RoomRecord) => RoomRecord;

/**
 * Ordered by source version: MIGRATIONS[0] upgrades a v1 record to v2, and so
 * on. Adding a persisted field means appending a step here and bumping
 * ROOM_SCHEMA_VERSION — an older Room is then repaired on load and rewritten,
 * so the rest of the runtime only ever sees the current shape.
 */
const MIGRATIONS: RoomMigration[] = [
  // v1 -> v2: `timelineSequence` tells a watcher that the timeline moved. An
  // existing Room restarts the count; the panel only compares it with itself.
  (record) => ({ ...record, runtime: { ...record.runtime, timelineSequence: 0 } }),
  // v2 -> v3: `statusAt` says when a member entered its current status. An
  // existing member's true transition time is unknown; its creation time is
  // the honest floor ("waiting since at most then").
  (record) => ({
    ...record,
    members: record.members.map((member) => ({ ...member, statusAt: member.createdAt })),
  }),
];

/** Applies backward-compatible upgrades when a persisted Room is loaded. */
export function migrateRoomRecord(record: RoomRecord, fromVersion: number): RoomRecord {
  let migrated = record;
  for (let version = fromVersion; version < ROOM_SCHEMA_VERSION; version += 1) {
    migrated = MIGRATIONS[version - 1](migrated);
  }
  return migrated;
}
