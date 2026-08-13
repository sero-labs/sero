/**
 * Room commands and their authority (spec §18, architecture.md §2.4).
 *
 * Room operations are ordinary plugin commands bridged through the one
 * `sero-cli` tool (AD-020) — a member never receives a schema per operation.
 * Conductor-only operations are enforced HERE, against the caller identity the
 * runtime supplies. Prompt text is never an authority source: a member that
 * says it is the Conductor is still checked against the roster.
 */

export type RoomCommandId =
  | 'show-roster'
  | 'send-message'
  | 'broadcast'
  | 'ask'
  | 'reply'
  | 'wait'
  | 'show-mandate'
  | 'update-mandate'
  | 'update-work'
  | 'claim-paths'
  | 'release-paths'
  | 'publish-artifact'
  | 'report-status'
  | 'request-attention'
  | 'publish-note'
  | 'propose-revision'
  | 'finish-room';

export interface RoomCommandSpec {
  id: RoomCommandId;
  /** User-facing, used in the timeline and the command bridge listing. */
  label: string;
  /**
   * Conductor authority (§12.1): the roster, mandates, the Room brief note and
   * finishing the Room. Everything else is a member's own work.
   */
  conductorOnly: boolean;
}

export const ROOM_COMMANDS: readonly RoomCommandSpec[] = [
  { id: 'show-roster', label: 'Show roster', conductorOnly: false },
  { id: 'send-message', label: 'Send message', conductorOnly: false },
  { id: 'broadcast', label: 'Broadcast', conductorOnly: false },
  { id: 'ask', label: 'Ask', conductorOnly: false },
  { id: 'reply', label: 'Reply', conductorOnly: false },
  { id: 'wait', label: 'Wait', conductorOnly: false },
  { id: 'show-mandate', label: 'Show mandate', conductorOnly: false },
  { id: 'update-mandate', label: 'Update mandate', conductorOnly: true },
  { id: 'update-work', label: 'Create or update work', conductorOnly: false },
  { id: 'claim-paths', label: 'Claim paths', conductorOnly: false },
  { id: 'release-paths', label: 'Release paths', conductorOnly: false },
  { id: 'publish-artifact', label: 'Publish artifact', conductorOnly: false },
  { id: 'report-status', label: 'Report status', conductorOnly: false },
  { id: 'request-attention', label: 'Request attention', conductorOnly: false },
  { id: 'publish-note', label: 'Publish situation note', conductorOnly: true },
  { id: 'propose-revision', label: 'Propose Room revision', conductorOnly: true },
  { id: 'finish-room', label: 'Finish Room', conductorOnly: true },
];

export interface RoomCommandRequest {
  /** Operation id. An unknown id is refused, never treated as a no-op. */
  command: string;
  /**
   * Idempotency key, persisted as the record's `commandId` (NFR-003). A retry
   * carrying the same key never creates a second logical message or revision.
   */
  commandId: string;
  actorMemberId: string;
}

/** The caller as the RUNTIME knows it, resolved from the roster — not from the payload. */
export interface RoomCommandActor {
  memberId: string;
  isConductor: boolean;
}

export type RoomCommandDenyCode =
  | 'unknown-command'
  | 'missing-idempotency-key'
  | 'actor-mismatch'
  | 'conductor-only';

export type RoomCommandValidation =
  | { ok: true; command: RoomCommandSpec }
  | { ok: false; code: RoomCommandDenyCode; message: string };

export function validateRoomCommand(
  request: RoomCommandRequest,
  actor: RoomCommandActor,
): RoomCommandValidation {
  const command = ROOM_COMMANDS.find((candidate) => candidate.id === request.command);
  if (!command) {
    return { ok: false, code: 'unknown-command', message: `${request.command} is not a Room command.` };
  }
  if (!request.commandId.trim()) {
    return { ok: false, code: 'missing-idempotency-key', message: `${command.label} needs an idempotency key.` };
  }
  if (request.actorMemberId !== actor.memberId) {
    return {
      ok: false,
      code: 'actor-mismatch',
      message: `The request names ${request.actorMemberId}, but the caller is ${actor.memberId}.`,
    };
  }
  if (command.conductorOnly && !actor.isConductor) {
    return { ok: false, code: 'conductor-only', message: `Only the Conductor can use ${command.label}.` };
  }
  return { ok: true, command };
}
