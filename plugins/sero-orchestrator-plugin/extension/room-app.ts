/**
 * The `rooms` tool — the USER's Room control surface, which the Room panel
 * drives (phase 7).
 *
 * The sibling `room` tool is the member bridge: it is refused unless the caller
 * IS a member, and every command it takes is checked against the roster. This
 * one is the mirror image, and it is refused when the caller is a member. A
 * member that could reach this door would approve its own requests and cancel
 * the Room the user is watching, which is exactly what §22 keeps apart.
 *
 * The tool holds no logic of its own: it turns flat parameters into a call on
 * `RoomAppActions`, which the runtime owns.
 */

import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { resolveRoomAppByCwd, resolveRoomRouterForCaller } from '../runtime/registry';
import type { RoomAppActions, PrepareRoomOutcome } from '../runtime/rooms/room-app-actions';
import type { RoomCallerSignals } from '../runtime/rooms/room-command-router';
import { MEMBER_PERMISSION_LEVELS, type MemberPermissionLevel } from '../shared/room-blueprint-types';
import { BUILT_IN_ROOM_TEMPLATES } from '../shared/room-templates';
import { DELIVERY_DESTINATION_IDS, type DeliveryDestinationId } from '../shared/delivery-types';

export const ROOM_APP_ACTIONS = [
  'prepare',
  'adjust',
  'start',
  'pause',
  'resume',
  'cancel',
  'delete',
  'resolve_approval',
  'intervene',
  'wake',
  'answer',
  'release',
  'timeline',
  'watch',
  'unwatch',
  'history',
  'context',
] as const;

const APPROVAL_DECISIONS = ['approved', 'rejected'] as const;

/** When the user's word reaches the team. `now` costs a wake; `next-turn` costs nothing. */
const DELIVER_MODES = ['now', 'next-turn'] as const;

const ROOM_PRESET_IDS = BUILT_IN_ROOM_TEMPLATES.map((template) => template.id);

export const RoomAppToolParams = Type.Object({
  action: StringEnum(ROOM_APP_ACTIONS, { description: 'What to do with a Room' }),
  roomId: Type.Optional(Type.String({ description: 'The Room to act on. Not needed for prepare' })),
  problem: Type.Optional(Type.String({ description: 'For prepare: what the Room is for, in the user\'s own words' })),
  instruction: Type.Optional(Type.String({ description: 'For adjust: what to change about the proposed team, in plain words' })),
  body: Type.Optional(Type.String({ description: 'For intervene: what to tell the Room. For answer: the answer the waiting member needs' })),
  memberIds: Type.Optional(Type.String({ description: 'For intervene: member ids to address, comma-separated (default: everyone)' })),
  deliver: Type.Optional(StringEnum(DELIVER_MODES, { description: 'For intervene: now interrupts the members it names; next-turn waits for their next turn' })),
  memberId: Type.Optional(Type.String({ description: 'For wake: the member to put back to work now. For history: whose session to read' })),
  detail: Type.Optional(Type.String({ description: 'For pause/cancel: why, shown to the user and the Room' })),
  approvalId: Type.Optional(Type.String({ description: 'For resolve_approval: the approval to answer' })),
  decision: Type.Optional(StringEnum(APPROVAL_DECISIONS, { description: 'For resolve_approval: the answer' })),
  maxCostUsd: Type.Optional(Type.Number({ description: 'For prepare: the most this Room may spend' })),
  maxMinutes: Type.Optional(Type.Number({ description: 'For prepare: the longest this Room may run' })),
  maxMembers: Type.Optional(Type.Number({ description: 'For prepare: the largest team allowed' })),
  access: Type.Optional(StringEnum(MEMBER_PERMISSION_LEVELS, { description: 'For prepare: the highest access any member may hold' })),
  deliveryDestination: Type.Optional(StringEnum(DELIVERY_DESTINATION_IDS, { description: 'For prepare: where the result goes. invoking-chat returns it to the chat that asked' })),
  presetId: Type.Optional(StringEnum(ROOM_PRESET_IDS, { description: 'For prepare: a preset to start from. It guides the planner and never widens what the team may do' })),
  limit: Type.Optional(Type.Number({ description: 'For timeline and history: how many entries to return' })),
  cursor: Type.Optional(Type.String({ description: 'For history: the cursor from the previous page, to read further back' })),
  clarificationsJson: Type.Optional(Type.String({ description: 'For prepare: answers to the planner\'s questions, as JSON [{"prompt":"...","answer":"..."}]' })),
});

export interface RoomAppToolParamsShape {
  action: (typeof ROOM_APP_ACTIONS)[number];
  roomId?: string;
  problem?: string;
  instruction?: string;
  body?: string;
  memberIds?: string;
  deliver?: (typeof DELIVER_MODES)[number];
  memberId?: string;
  detail?: string;
  approvalId?: string;
  decision?: (typeof APPROVAL_DECISIONS)[number];
  maxCostUsd?: number;
  maxMinutes?: number;
  maxMembers?: number;
  access?: MemberPermissionLevel;
  deliveryDestination?: DeliveryDestinationId;
  presetId?: string;
  limit?: number;
  cursor?: string;
  clarificationsJson?: string;
}

interface ToolResult {
  text: string;
  content: { type: 'text'; text: string }[];
  details: Record<string, unknown>;
}

function result(text: string, details: Record<string, unknown> = {}): ToolResult {
  return { text, content: [{ type: 'text', text }], details };
}

function failure(message: string): ToolResult {
  return result(`Error: ${message}`, { ok: false, error: message });
}

const list = (value: string | undefined): string[] =>
  (value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);

/** Answers to the planner's earlier questions. Malformed JSON is a caller error, not a silent empty list. */
function clarificationsOf(
  raw: string | undefined,
): { prompt: string; answer: string }[] | { error: string } {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: 'clarificationsJson is not valid JSON' };
  }
  if (!Array.isArray(parsed)) return { error: 'clarificationsJson must be a JSON array' };
  const answers = parsed.filter(
    (entry): entry is { prompt: string; answer: string } =>
      typeof entry === 'object' && entry !== null &&
      typeof (entry as { prompt?: unknown }).prompt === 'string' &&
      typeof (entry as { answer?: unknown }).answer === 'string',
  );
  return answers.length === parsed.length
    ? answers
    : { error: 'each clarification needs a "prompt" and an "answer" string' };
}

/** A planned or re-planned Room reads the same either way — proposal, or the questions it still needs. */
function plannedResult(outcome: PrepareRoomOutcome): ToolResult {
  if (outcome.ok) {
    const { proposal } = outcome;
    const clamped = outcome.clamps.length > 0 ? ` ${outcome.clamps.length} of your limits changed the plan.` : '';
    const minutes = Math.round(proposal.maxWallClockMs / 60_000);
    return result(
      `Room ${outcome.roomId} is ready to review: ${proposal.teamSize} member(s), up to ${minutes} minute(s) and $${proposal.maxCostUsd.toFixed(2)}.${clamped}`,
      { ok: true, roomId: outcome.roomId, proposal, clamps: outcome.clamps },
    );
  }
  if (outcome.needsInput) {
    return result(
      `The planner needs ${outcome.questions.length} answer(s) before it can staff this Room.`,
      { ok: false, needsInput: true, questions: outcome.questions },
    );
  }
  return failure(outcome.error);
}

async function run(
  app: RoomAppActions,
  params: RoomAppToolParamsShape,
  originSessionId: string | null,
): Promise<ToolResult> {
  if (params.action === 'prepare') {
    const clarifications = clarificationsOf(params.clarificationsJson);
    if ('error' in clarifications) return failure(clarifications.error);
    return plannedResult(
      await app.prepare({
        problem: params.problem ?? '',
        presetId: params.presetId,
        clarifications,
        originSessionId,
        limits: {
          maxCostUsd: params.maxCostUsd,
          maxWallClockMs: params.maxMinutes === undefined ? undefined : params.maxMinutes * 60_000,
          maxMembers: params.maxMembers,
          access: params.access,
          deliveryDestination: params.deliveryDestination,
        },
      }),
    );
  }

  const roomId = params.roomId?.trim();
  if (!roomId) return failure(`roomId is required for ${params.action}`);
  return params.action === 'adjust'
    ? plannedResult(await app.adjust(roomId, params.instruction ?? ''))
    : settledResult(app, roomId, params);
}

/** Every action past planning answers the same way: it worked, or it says why not. */
async function settledResult(
  app: RoomAppActions,
  roomId: string,
  params: RoomAppToolParamsShape,
): Promise<ToolResult> {
  const done = (text: string) => result(text, { ok: true, roomId });

  switch (params.action) {
    case 'start': {
      const outcome = await app.start(roomId);
      return outcome.ok ? done(`Room ${roomId} started.`) : failure(outcome.error);
    }
    case 'pause': {
      const outcome = await app.pause(roomId, params.detail);
      return outcome.ok ? done(`Room ${roomId} is pausing. Turns in flight finish first.`) : failure(outcome.error);
    }
    case 'resume': {
      const outcome = await app.resume(roomId);
      return outcome.ok ? done(`Room ${roomId} resumed.`) : failure(outcome.error);
    }
    case 'cancel': {
      const outcome = await app.cancel(roomId, params.detail);
      return outcome.ok
        ? done(`Room ${roomId} cancelled. Uncommitted member work was preserved.`)
        : failure(outcome.error);
    }
    case 'delete': {
      const outcome = await app.remove(roomId);
      return outcome.ok ? done(`Room ${roomId} deleted.`) : failure(outcome.error);
    }
    case 'resolve_approval': {
      const approvalId = params.approvalId?.trim();
      if (!approvalId) return failure('approvalId is required for resolve_approval');
      if (!params.decision) return failure('decision is required for resolve_approval');
      const outcome = await app.resolveApproval(roomId, approvalId, params.decision);
      return outcome.ok ? done(`Approval ${approvalId} ${params.decision}.`) : failure(outcome.error);
    }
    case 'intervene': {
      const now = params.deliver !== 'next-turn';
      const outcome = await app.intervene(roomId, params.body ?? '', list(params.memberIds), now);
      return outcome.ok
        ? done(now ? 'The Room was told, and the members it reached are awake.' : 'The Room was told. It arrives on their next turn.')
        : failure(outcome.error);
    }
    case 'timeline': {
      const events = await app.timeline(roomId, params.limit);
      return result(`${events.length} event(s) in Room ${roomId}.`, { ok: true, roomId, events });
    }
    case 'watch': {
      const snapshots = await app.watch(roomId);
      const live = snapshots.filter((snapshot) => snapshot.turnId !== null).length;
      return result(`${live} of ${snapshots.length} member(s) are mid-turn.`, { ok: true, roomId, snapshots });
    }
    case 'unwatch': {
      await app.unwatch(roomId);
      return done(`Stopped watching Room ${roomId}.`);
    }
    case 'context': {
      const memberId = params.memberId?.trim();
      if (!memberId) return failure('memberId is required for context');
      const usage = await app.context(roomId, memberId);
      return result(
        usage ? `${memberId} has used ${usage.usedTokens} of ${usage.maxTokens} tokens.` : `${memberId} has no live session.`,
        { ok: true, roomId, memberId, usage },
      );
    }
    case 'history': {
      const memberId = params.memberId?.trim();
      if (!memberId) return failure('memberId is required for history');
      const page = await app.history(roomId, memberId, { cursor: params.cursor, limit: params.limit });
      return result(`${page.entries.length} history entry(ies) for ${memberId}.`, {
        ok: true,
        roomId,
        memberId,
        entries: page.entries,
        olderCursor: page.olderCursor,
      });
    }
    case 'answer': {
      const memberId = params.memberId?.trim();
      if (!memberId) return failure('memberId is required for answer');
      const outcome = await app.answer(roomId, memberId, params.body ?? '');
      return outcome.ok ? done(`${memberId} has its answer and is awake.`) : failure(outcome.error);
    }
    case 'release': {
      const memberId = params.memberId?.trim();
      if (!memberId) return failure('memberId is required for release');
      const outcome = await app.release(roomId, memberId);
      return outcome.ok ? done(`${memberId} is no longer waiting on that question.`) : failure(outcome.error);
    }
    case 'wake': {
      const memberId = params.memberId?.trim();
      if (!memberId) return failure('memberId is required for wake');
      const outcome = await app.wake(roomId, memberId);
      return outcome.ok ? done(`${memberId} is awake.`) : failure(outcome.error);
    }
    default:
      return failure(`Unknown Room action: ${String(params.action)}`);
  }
}

export async function executeRoomAppTool(
  params: RoomAppToolParamsShape,
  ctx: ExtensionContext | undefined,
  resolveApp: (cwd: string) => RoomAppActions | undefined = resolveRoomAppByCwd,
  resolveMember: (signals: RoomCallerSignals) => Promise<unknown> = resolveRoomRouterForCaller,
): Promise<ToolResult> {
  const signals: RoomCallerSignals = {
    sessionPath: ctx?.sessionManager.getSessionFile?.() ?? null,
    cwd: ctx?.cwd ?? null,
  };
  // Which chat gets the result (FR-029). A chat has a session file on disk; the
  // Room panel's own agent session is in-memory, and a result delivered there
  // would reach nobody — so a Room prepared from the panel has no origin chat.
  const originSessionId = signals.sessionPath ? ctx?.sessionManager.getSessionId?.() ?? null : null;
  // The authority rule. A member has its own surface, where every command is
  // checked against the roster; letting it through here would hand it the
  // user's controls.
  if (await resolveMember(signals)) {
    return failure('This is the user\'s Room control surface. Use the `room` tool for what a member may do.');
  }
  if (!ctx?.cwd) return failure('No workspace context (cwd) available for this invocation.');
  const app = resolveApp(ctx.cwd);
  if (!app) {
    return failure('Room mode is not available for this workspace. Check that this Sero build supports persistent agent sessions.');
  }
  return run(app, params, originSessionId);
}

export function registerRoomAppTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'rooms',
    label: 'Rooms',
    description:
      'Create and control Agent Rooms on the user\'s behalf. ' +
      `Actions: ${ROOM_APP_ACTIONS.join(', ')}. ` +
      'Start with prepare, which plans a team from one brief and drafts the Room for review; nothing runs until start. ' +
      'watch reports what every member is doing right now, and history reads one member\'s own session. ' +
      'If you are a member of a Room, this tool is not for you — use `room`.',
    parameters: RoomAppToolParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeRoomAppTool(params as RoomAppToolParamsShape, ctx);
    },
  });
}
