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
  | 'collect-commits'
  | 'request-delivery-approval'
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
  /**
   * How to call it, arguments and all.
   *
   * A member holds one bridged tool, so the only thing it knows about a command
   * is what the protocol prompt tells it. Without the arguments in front of it a
   * member invents a format, every call is refused for a missing field, and a
   * Room that could do the work does nothing at all. Live runs failed exactly
   * that way, so the syntax lives beside the command it belongs to.
   */
  usage: string;
}

export const ROOM_COMMANDS: readonly RoomCommandSpec[] = [
  { id: 'show-roster', label: 'Show roster', conductorOnly: false, usage: 'sero room show-roster' },
  {
    id: 'send-message',
    label: 'Send message',
    conductorOnly: false,
    usage: 'sero room send-message --to implementer --body "the parser is ready"',
  },
  { id: 'broadcast', label: 'Broadcast', conductorOnly: false, usage: 'sero room broadcast --body "I am on the parser"' },
  {
    id: 'ask',
    label: 'Ask',
    conductorOnly: false,
    usage: 'sero room ask --to implementer --body "which file holds the parser?"',
  },
  {
    id: 'reply',
    label: 'Reply',
    conductorOnly: false,
    usage: 'sero room reply --questionId <id from the question> --body "src/parser.ts"',
  },
  { id: 'wait', label: 'Wait', conductorOnly: false, usage: 'sero room wait --questionId <id you asked>' },
  { id: 'show-mandate', label: 'Show mandate', conductorOnly: false, usage: 'sero room show-mandate' },
  {
    id: 'update-mandate',
    label: 'Update mandate',
    conductorOnly: true,
    usage: 'sero room update-mandate --memberId implementer --task "fix the parser" --priorities "tests first"',
  },
  {
    id: 'update-work',
    label: 'Create or update work',
    conductorOnly: false,
    usage:
      'sero room update-work --title "Fix the parser" --memberId implementer --status "in progress"'
      + ' (add --workId to update one)',
  },
  {
    id: 'claim-paths',
    label: 'Claim paths',
    conductorOnly: false,
    usage: 'sero room claim-paths --paths "src/parser.ts,src/lexer.ts" --reason "rewriting the tokenizer"',
  },
  { id: 'release-paths', label: 'Release paths', conductorOnly: false, usage: 'sero room release-paths --paths "src/parser.ts"' },
  {
    id: 'publish-artifact',
    label: 'Publish artifact',
    conductorOnly: false,
    usage: 'sero room publish-artifact --artifactKind report --title "Findings" --body "…"',
  },
  { id: 'report-status', label: 'Report status', conductorOnly: false, usage: 'sero room report-status --body "fixing the parser"' },
  {
    id: 'request-attention',
    label: 'Request attention',
    conductorOnly: false,
    usage: 'sero room request-attention --body "the API key is missing"',
  },
  { id: 'publish-note', label: 'Publish situation note', conductorOnly: true, usage: 'sero room publish-note --body "we are on track"' },
  {
    id: 'propose-revision',
    label: 'Propose Room revision',
    conductorOnly: true,
    usage: 'sero room propose-revision --proposalJson \'{"kind":"suspend-member","memberId":"reviewer"}\' --reason "idle"',
  },
  {
    id: 'collect-commits',
    label: 'Collect member commits and report overlapping edits',
    conductorOnly: true,
    usage: 'sero room collect-commits',
  },
  {
    id: 'request-delivery-approval',
    label: 'Ask the user to approve sending the result out of Sero',
    conductorOnly: true,
    usage: 'sero room request-delivery-approval --content "the exact text the send will carry"',
  },
  {
    id: 'finish-room',
    label: 'Finish Room',
    conductorOnly: true,
    usage: 'sero room finish-room --summary "what the Room achieved" (add --ref where the result landed)',
  },
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
