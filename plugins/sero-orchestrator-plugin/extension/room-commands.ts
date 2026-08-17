/**
 * The AD-020 Room command surface (spec §18).
 *
 * ONE handler for every logical Room operation. Sero bridges it through the
 * single `sero-cli` tool, so a member runs `sero room --command ask --to
 * reviewer --body "..."` and never carries a tool schema per operation. Fifteen
 * schemas on every turn of every member would be a tax the whole Room pays, for
 * a surface that changes rarely — that is the whole point of AD-020.
 *
 * This file does no Room logic. It shapes flat CLI arguments into the router's
 * input, and the router — which runs in the runtime, where the roster is —
 * resolves the caller, checks its authority and routes to the module that owns
 * the operation.
 *
 * There is no identity argument on this surface at all. The caller is resolved
 * from the live session, which the host bound to one member when it created it,
 * so "I am the Conductor" is not a sentence a member can write. The router
 * refuses a declared identity if some other caller supplies one; a member is
 * never even offered the field.
 */

import { StringEnum } from '@earendil-works/pi-ai';
import { Type } from 'typebox';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { ROOM_COMMANDS } from '../shared/room-commands';
import type { RoomArtifactKind } from '../shared/room-message-types';
import type {
  RoomCallerSignals,
  RoomCommandInput,
  RoomCommandOutcome,
  RoomCommandRouter,
} from '../runtime/rooms/room-command-router';
import { parseRoomRevisionProposal } from '../shared/room-revision-parse';
import { resolveRoomRouterForCaller } from '../runtime/registry';

const ROOM_COMMAND_IDS = ROOM_COMMANDS.map((command) => command.id);

const ARTIFACT_KINDS = [
  'plan', 'decision', 'branch', 'commit', 'patch', 'test-result', 'review', 'report', 'pull-request', 'final-answer',
] as const;

/**
 * One schema for the whole surface. Fields are shared across commands on
 * purpose: `body` is the message, the note, the status line and the artifact
 * content, because a member reads one short parameter list far better than
 * fifteen near-identical ones.
 */
export const RoomToolParams = Type.Object({
  command: StringEnum(ROOM_COMMAND_IDS, { description: 'Room operation to run' }),
  body: Type.Optional(Type.String({ description: 'Message, question, answer, status line, note, or artifact content' })),
  to: Type.Optional(Type.String({ description: 'Member ids to address, comma-separated (see show-roster)' })),
  questionId: Type.Optional(Type.String({ description: 'For reply/wait: the question id from the message you received' })),
  wake: Type.Optional(Type.Boolean({ description: 'For send-message/broadcast: ask to wake idle recipients (Room policy may still refuse)' })),
  keepWorking: Type.Optional(Type.Boolean({ description: 'For ask: carry on instead of waiting for the answer (default: wait — your turn ends and resumes when it arrives)' })),
  memberId: Type.Optional(Type.String({ description: 'For show-mandate/update-mandate/update-work: the member the command is about' })),
  workId: Type.Optional(Type.String({ description: 'For update-work: the work item to update; omit to create one' })),
  title: Type.Optional(Type.String({ description: 'For update-work/publish-artifact: the title' })),
  status: Type.Optional(Type.String({ description: 'For update-work: free-form status, e.g. "in review", "blocked", "done"' })),
  notes: Type.Optional(Type.String({ description: 'For update-work: short notes; for update-mandate: the responsibilities' })),
  dependsOn: Type.Optional(Type.String({ description: 'For update-work: work ids this depends on, comma-separated' })),
  paths: Type.Optional(Type.String({ description: 'For claim-paths/release-paths: paths, directories or globs, comma-separated' })),
  reason: Type.Optional(Type.String({ description: 'Why — for a claim, a mandate change or a revision' })),
  artifactKind: Type.Optional(StringEnum(ARTIFACT_KINDS, { description: 'For publish-artifact: what kind of artifact it is' })),
  artifactId: Type.Optional(Type.String({ description: 'For read-artifact: the artifact id from show-artifacts' })),
  content: Type.Optional(Type.String({ description: 'For request-delivery-approval: the EXACT text the send will carry. The user approves that text, and only that text may be delivered' })),
  approvalId: Type.Optional(Type.String({ description: 'For finish-room: the approval id from request-delivery-approval, when the result was sent outside Sero' })),
  ref: Type.Optional(Type.String({ description: 'For publish-artifact: an external reference (URL, branch, commit) instead of body content; for finish-room: where the delivered result landed' })),
  relatedWorkId: Type.Optional(Type.String({ description: 'For publish-artifact: the work item it came from' })),
  task: Type.Optional(Type.String({ description: 'For update-mandate: the member\'s new current task' })),
  priorities: Type.Optional(Type.String({ description: 'For update-mandate: priorities, comma-separated' })),
  instructions: Type.Optional(Type.String({ description: 'For update-mandate: how the member should work (instructions only — it can never add a tool, model or permission)' })),
  proposalJson: Type.Optional(Type.String({ description: 'For propose-revision: JSON RoomRevisionProposal, e.g. {"kind":"suspend-member","memberId":"reviewer"}' })),
  summary: Type.Optional(Type.String({ description: 'For finish-room: the Room\'s final answer' })),
  commandId: Type.Optional(Type.String({ description: 'Optional idempotency key. Repeat the SAME value to retry safely; a new call gets a new key' })),
});

export interface RoomToolParamsShape {
  command: (typeof ROOM_COMMAND_IDS)[number];
  body?: string;
  to?: string;
  questionId?: string;
  wake?: boolean;
  keepWorking?: boolean;
  memberId?: string;
  workId?: string;
  title?: string;
  status?: string;
  notes?: string;
  dependsOn?: string;
  paths?: string;
  reason?: string;
  artifactKind?: RoomArtifactKind;
  artifactId?: string;
  content?: string;
  approvalId?: string;
  ref?: string;
  relatedWorkId?: string;
  task?: string;
  priorities?: string;
  instructions?: string;
  proposalJson?: string;
  summary?: string;
  commandId?: string;
}

interface ToolResult {
  text: string;
  content: { type: 'text'; text: string }[];
  details: Record<string, unknown>;
}

function result(outcome: RoomCommandOutcome): ToolResult {
  const text = outcome.ok ? outcome.text : `Error: ${outcome.text}`;
  return { text, content: [{ type: 'text', text }], details: { ok: outcome.ok, ...outcome.details } };
}

function failure(message: string): ToolResult {
  return result({ ok: false, text: message, details: {} });
}

/** Comma-separated lists are what a CLI argument can carry; empty entries are dropped. */
function list(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const items = value.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  return items.length > 0 ? items : undefined;
}

export function buildRoomCommandInput(
  params: RoomToolParamsShape,
): RoomCommandInput | { error: string } {
  let proposal: RoomCommandInput['proposal'];
  if (params.proposalJson !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(params.proposalJson);
    } catch {
      return { error: 'proposalJson is not valid JSON' };
    }
    const result = parseRoomRevisionProposal(parsed);
    if ('error' in result) return { error: `proposalJson is invalid: ${result.error}` };
    proposal = result.proposal;
  }
  return {
    command: params.command,
    commandId: params.commandId,
    body: params.body,
    to: list(params.to),
    questionId: params.questionId,
    wake: params.wake,
    keepWorking: params.keepWorking,
    memberId: params.memberId,
    workId: params.workId,
    title: params.title,
    status: params.status,
    notes: params.notes,
    dependsOn: list(params.dependsOn),
    paths: list(params.paths),
    reason: params.reason,
    artifactKind: params.artifactKind,
    artifactId: params.artifactId,
    content: params.content,
    approvalId: params.approvalId,
    ref: params.ref,
    relatedWorkId: params.relatedWorkId,
    task: params.task,
    priorities: list(params.priorities),
    instructions: params.instructions,
    proposal,
    summary: params.summary,
  };
}

/**
 * The session file this call is running in.
 *
 * It is the strongest caller signal available: the host created the file for one
 * member subject and a member cannot make its own session report another
 * member's path. `cwd` is the fallback the router uses for an editing member,
 * whose grant pins it to exactly one worktree.
 */
function sessionPathOf(ctx: ExtensionContext | undefined): string | null {
  return ctx?.sessionManager.getSessionFile?.() ?? null;
}

export async function executeRoomCommand(
  params: RoomToolParamsShape,
  ctx: ExtensionContext | undefined,
  resolve: (signals: RoomCallerSignals) => Promise<RoomCommandRouter | undefined> = resolveRoomRouterForCaller,
): Promise<ToolResult> {
  const signals: RoomCallerSignals = { sessionPath: sessionPathOf(ctx), cwd: ctx?.cwd ?? null };
  const router = await resolve(signals);
  if (!router) {
    return failure('Room commands are for Room members, and this session is not one.');
  }
  const input = buildRoomCommandInput(params);
  if ('error' in input) return failure(input.error);
  return result(await router.execute(signals, input));
}

export function registerRoomCommands(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'room',
    label: 'Room',
    // The first sentence becomes the one-line summary in the CLI listing, so it
    // has to stand alone; the command list follows it.
    description:
      'Talk to the Room you are a member of — its roster, messages, work and artifacts. ' +
      `Commands: ${ROOM_COMMANDS.map((command) => command.id).join(', ')}. ` +
      'Ask when you are blocked, reply when you are asked, and wait rather than guessing — waiting ends your turn and resumes it when the answer arrives.',
    parameters: RoomToolParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeRoomCommand(params as RoomToolParamsShape, ctx);
    },
  });
}
