import { DEFAULT_ROOM_INDEX } from '../../shared/defaults';
import type { PersistedRoom, RoomIndex } from '../../shared/room-types';
import { useStateDir } from './use-orchestrator-index';
import { useWatchedJson } from './use-watched-json';

/**
 * Follows the watched Room index (rooms/index.json).
 *
 * A workspace where Room mode has never run has no such file, and the empty
 * index is the honest answer — the Rooms surface then shows what a Room is and
 * how to start one, rather than an error.
 */
export function useRoomIndex(): RoomIndex {
  const stateDir = useStateDir();
  return useWatchedJson<RoomIndex>(stateDir ? `${stateDir}/rooms/index.json` : null, DEFAULT_ROOM_INDEX);
}

/**
 * Follows ONE Room's own record. Separate from the index on purpose: the index
 * carries what a list needs, and the open Room carries everything else, so a
 * busy Room does not rewrite the list on every turn.
 */
export function useRoom(roomId: string | null): PersistedRoom | null {
  const stateDir = useStateDir();
  const path = roomId && stateDir ? `${stateDir}/rooms/${roomId}/room.json` : null;
  return useWatchedJson<PersistedRoom | null>(path, null);
}
