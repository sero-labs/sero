/**
 * Reading one published artifact from the Room's OWN surface.
 *
 * Beside `room-command-artifacts.ts`, which owns the member-facing equivalent
 * through the `room` bridge: a member reads an artifact to see what a peer
 * produced, and the user's Room panel reads one to show the plan it is about to
 * be handed. Same file, two doors, and the authority differs at each.
 *
 * Split out of `room-app-actions.ts` (500-LOC limit) rather than grown inside it.
 */

import type { RoomArtifact } from '../../shared/room-message-types';
import type { OrchestratorHost } from '../host';
import type { RoomStore } from './room-store';

export interface RoomArtifactReadOutcome {
  ok: boolean;
  /** The artifact the Room holds, so the caller can name it even when it cannot be read. */
  artifact?: RoomArtifact;
  /** The artifact's own content, present only when the read succeeded. */
  content?: string;
  /** Why the read did not happen: an unknown artifact, or one whose reference cannot be opened. */
  error?: string;
}

export interface RoomArtifactActionDeps {
  host: Pick<OrchestratorHost, 'readArtifact'>;
  store: Pick<RoomStore, 'readRoom'>;
}

/**
 * One artifact's content, looked up against the Room that is asking.
 *
 * The artifact list comes from the Room record, so an id belonging to another
 * Room simply is not found here — the refusal is the lookup, not a check
 * bolted onto it.
 */
export async function readRoomArtifact(
  deps: RoomArtifactActionDeps,
  roomId: string,
  artifactId: string,
): Promise<RoomArtifactReadOutcome> {
  const wanted = artifactId.trim();
  if (!wanted) return { ok: false, error: 'Name the artifact to read.' };
  const record = await deps.store.readRoom(roomId);
  if (!record) return { ok: false, error: `Room not found: ${roomId}` };
  const artifact = record.artifacts.find((candidate) => candidate.id === wanted);
  if (!artifact) return { ok: false, error: `${wanted} is not an artifact of this Room.` };

  const content = await deps.host.readArtifact(artifact.ref);
  // An artifact can name an external reference (a URL, a commit) this process
  // cannot open. Saying so is the answer; showing the artifact as empty is not.
  if (content === null) {
    return { ok: false, artifact, error: `This artifact points at ${artifact.ref}, which cannot be read from here.` };
  }
  return { ok: true, artifact, content };
}
