import { ROOM_SCHEMA_VERSION, type RoomRecord } from './room-state';

/** Upgrades one persisted Room record by a single schema version. */
type RoomMigration = (record: RoomRecord) => RoomRecord;

/**
 * Ordered by source version: MIGRATIONS[0] upgrades a v1 record to v2, and so
 * on. Adding a persisted field means appending a step here and bumping
 * ROOM_SCHEMA_VERSION — an older Room is then repaired on load and rewritten,
 * so the rest of the runtime only ever sees the current shape.
 */
const MIGRATIONS: RoomMigration[] = [];

/** Applies backward-compatible upgrades when a persisted Room is loaded. */
export function migrateRoomRecord(record: RoomRecord, fromVersion: number): RoomRecord {
  let migrated = record;
  for (let version = fromVersion; version < ROOM_SCHEMA_VERSION; version += 1) {
    migrated = MIGRATIONS[version - 1](migrated);
  }
  return migrated;
}
