/**
 * The USER's Room control surface (phase 7).
 *
 * A member reaches its Room through the AD-020 `room` bridge, which checks every
 * command against the roster. This is the other side — what the Room panel does,
 * and only ever on the user's behalf. The two surfaces share no path, and the
 * one authority rule that matters is enforced at the bridge above this file: a
 * caller that any Room recognises as a member is refused here, so a member
 * cannot approve its own request or cancel the Room by taking the user's door.
 *
 * Nothing in this file writes a Room record directly. Planning goes through
 * `planner.ts` / `adjust.ts`, and every state change goes through the
 * coordinator or the store, which is the single writer.
 */

import type { HumanQuestion } from '../../shared/human-input-types';
import { roomPlannerSessionId } from '../../shared/ids';
import type { RoomProposalSummary } from '../../shared/room-blueprint-types';
import type { BlueprintClamp } from '../../shared/room-clamp';
import type { RoomTimelineEvent } from '../../shared/room-message-types';
import { TERMINAL_ROOM_STATUSES, type MemberStatus, type RoomStatus } from '../../shared/room-types';
import { findRoomTemplate, type RoomTemplate } from '../../shared/room-templates';
import { adjustRoom } from './adjust';
import { planRoom, type RoomUserLimits } from './planner';
import type { RoomPresetSeed } from './planner-prompt';
import { buildRoomRecord } from './room-actions';
import type { RoomCoordinator } from './room-coordinator';
import { createRoomLiveActions, type RoomLiveActions, type RoomLiveContext } from './room-app-live';
import { INVOKING_CHAT_DESTINATION } from './room-delivery';
import type { RoomMessageDraft } from './room-messages';

/** Room states the user may still re-plan. Past this, changes go through a revision. */
const PLANNABLE: readonly RoomStatus[] = ['draft', 'ready'];

/**
 * Member states a wake can actually move. `waiting` and `blocked` are cleared
 * to idle by the wake itself, and an idle member is already schedulable. The
 * rest go nowhere: a suspended member stays suspended until the Conductor
 * resumes it, and one that is starting, working, retired or failed has nothing
 * to wake.
 */
const WAKEABLE: readonly MemberStatus[] = ['idle', 'waiting', 'blocked'];

export interface RoomAppActionsContext extends RoomLiveContext {
  coordinator: RoomCoordinator;
  workspaceId: string;
}

export interface PrepareRoomInput {
  /** The user's own words, kept verbatim. */
  problem: string;
  /** A built-in preset to start from. Seeds the planner's prose, nothing else. */
  presetId?: string;
  limits?: RoomUserLimits;
  /** Answers to the planner's earlier questions, folded into a re-plan. */
  clarifications?: { prompt: string; answer: string }[];
  /** The chat that asked for the Room, when there was one. */
  originSessionId?: string | null;
}

/**
 * A Room a chat asked for answers that chat (FR-029) unless the caller named
 * somewhere else. The planner never chooses a destination, so the choice is
 * made here — the only place that knows a chat is behind this Room.
 */
export function limitsForOrigin(input: PrepareRoomInput): RoomUserLimits | undefined {
  if (!input.originSessionId || input.limits?.deliveryDestination) return input.limits;
  return { ...input.limits, deliveryDestination: INVOKING_CHAT_DESTINATION };
}

export interface RoomPlanned {
  ok: true;
  roomId: string;
  proposal: RoomProposalSummary;
  /** What the user's limits took away from the model's suggestion. */
  clamps: BlueprintClamp[];
}

export type PrepareRoomOutcome =
  | RoomPlanned
  | { ok: false; needsInput: true; questions: HumanQuestion[] }
  | { ok: false; needsInput?: false; error: string };

export type SimpleOutcome = { ok: true } | { ok: false; error: string };

export interface RoomAppActions extends RoomLiveActions {
  /** Plans a team from one brief and drafts the Room. Nothing runs yet. */
  prepare(input: PrepareRoomInput): Promise<PrepareRoomOutcome>;
  /** Re-plans a draft in the user's own words. Refused once the Room has started. */
  adjust(roomId: string, instruction: string): Promise<PrepareRoomOutcome>;
  start(roomId: string): Promise<SimpleOutcome>;
  pause(roomId: string, detail?: string): Promise<SimpleOutcome>;
  resume(roomId: string): Promise<SimpleOutcome>;
  cancel(roomId: string, detail?: string): Promise<SimpleOutcome>;
  remove(roomId: string): Promise<SimpleOutcome>;
  resolveApproval(roomId: string, approvalId: string, decision: 'approved' | 'rejected'): Promise<SimpleOutcome>;
  /**
   * The user's word to the Room. Delivered as a SYSTEM message, never as a peer
   * message: it comes from outside the roster, and a member must not be able to
   * forge one.
   *
   * `wake` is the difference between an interruption and a note. An
   * interruption reaches a member before it does the next thing; a note waits
   * for its next turn and costs nothing.
   */
  intervene(roomId: string, body: string, memberIds?: string[], wake?: boolean): Promise<SimpleOutcome>;
  /** Puts one member back to work now rather than at its next turn. */
  wake(roomId: string, memberId: string): Promise<SimpleOutcome>;
  /**
   * Answers, on the user's behalf, the question a member is blocked on.
   *
   * This is how a user breaks a deadlock the Room could not break itself. The
   * answer settles the wait by the same rule a member's reply does — it carries
   * the question id — so nothing special has to know the user wrote it.
   */
  answer(roomId: string, memberId: string, body: string): Promise<SimpleOutcome>;
  /**
   * Releases a member from a question that is never going to be answered. The
   * member starts again knowing the answer is not coming.
   */
  release(roomId: string, memberId: string): Promise<SimpleOutcome>;
  /**
   * Recent timeline events, newest first.
   *
   * The timeline is an append-only .jsonl file, which the renderer's JSON file
   * bridge cannot follow, so the panel reads it through here and re-reads when
   * the Room record changes. That keeps it PUSH-driven — the Room's own write
   * is the signal — rather than a poll.
   */
  timeline(roomId: string, limit?: number): Promise<RoomTimelineEvent[]>;
}

/** One screen of history. More than this is an audit question, not a panel question. */
const TIMELINE_PAGE = 100;

/**
 * A preset as the planner sees it: a label, how this kind of problem is usually
 * staffed, and the roles it tends to use.
 *
 * Deliberately prose ONLY. A template also carries preferred limits, a
 * permission ceiling and a delivery destination, and none of those are read
 * here: authority comes from the user's own choices, so picking a preset can
 * never widen what the team may do.
 */
function presetSeed(template: RoomTemplate): RoomPresetSeed {
  return {
    label: template.name,
    guidance: [template.planningStrategy, template.collaborationInstructions, template.outputExpectations]
      .filter(Boolean)
      .join('\n\n'),
    exampleRoles: template.exampleRoles.map((role) => `${role.role} — ${role.responsibility}`),
  };
}

export function createRoomAppActions(ctx: RoomAppActionsContext): RoomAppActions {
  const { host, store, coordinator, workspaceId } = ctx;
  const live = createRoomLiveActions(ctx);

  /** Every action but `prepare` names a Room, and a missing one is the same answer each time. */
  async function withRoom<T>(
    roomId: string,
    run: (status: RoomStatus) => Promise<T>,
  ): Promise<T | { ok: false; error: string }> {
    const record = await store.readRoom(roomId);
    if (!record) return { ok: false, error: `Room not found: ${roomId}` };
    return run(record.runtime.status);
  }

  /**
   * Nothing the user says reaches a Room that has stopped for good: its member
   * sessions are closed, so the message would never be read and the wake would
   * wake nobody. Refusing says so instead of reporting a send that did nothing.
   */
  const stopped = (status: RoomStatus): SimpleOutcome | null =>
    TERMINAL_ROOM_STATUSES.includes(status)
      ? { ok: false, error: 'This Room has finished. Nothing more reaches its members.' }
      : null;

  /**
   * Ends one member's wait on the user's word. Both ways of doing it write ONE
   * message and then wake the member: the message is what makes the wait
   * settled after a restart, and the wake is what makes it settled now.
   */
  async function settleWait(
    roomId: string,
    memberId: string,
    compose: (questionId: string) => Pick<RoomMessageDraft, 'kind' | 'body' | 'questionId' | 'inReplyToQuestionId'>,
  ): Promise<SimpleOutcome> {
    const member = await store.readMember(roomId, memberId);
    if (!member) return { ok: false, error: `${memberId} is not a member of this Room.` };
    if (member.status !== 'waiting' || !member.waitingOnQuestionId) {
      return { ok: false, error: `${member.displayName} is not waiting on a question.` };
    }
    await store.appendMessages(roomId, [{
      ...compose(member.waitingOnQuestionId),
      id: host.newId('msg'),
      fromMemberId: null,
      toMemberIds: [memberId],
      wakeRecipients: true,
      commandId: host.newId('cmd'),
      createdAt: host.now(),
    }]);
    await coordinator.wake(roomId, memberId, 'reply-received');
    return { ok: true };
  }

  /** The coordinator answers with the whole record; the user surface needs only the verdict. */
  const settled = (result: { ok: boolean; error?: string }): SimpleOutcome =>
    result.ok ? { ok: true } : { ok: false, error: result.error ?? 'That did not work.' };

  return {
    ...live,

    async prepare(input) {
      const problem = input.problem.trim();
      if (!problem) return { ok: false, error: 'Say what the Room is for.' };

      const template = input.presetId ? findRoomTemplate(input.presetId) : null;
      if (input.presetId && !template) return { ok: false, error: `There is no preset ${input.presetId}.` };

      const plan = await planRoom(host, {
        problem,
        parentSessionId: roomPlannerSessionId(workspaceId),
        limits: limitsForOrigin(input),
        clarifications: input.clarifications,
        preset: template ? presetSeed(template) : undefined,
      });
      if (!plan.ok) {
        return plan.needsInput
          ? { ok: false, needsInput: true, questions: plan.questions }
          : { ok: false, error: plan.errors.join('; ') };
      }

      const created = await coordinator.createRoom({
        problemStatement: problem,
        blueprint: plan.blueprint,
        proposal: plan.proposal,
        workspaceId,
        originSessionId: input.originSessionId ?? null,
      });
      if (!created.ok || !created.room) {
        return { ok: false, error: created.error ?? 'The team was planned but the Room could not be drafted.' };
      }
      return { ok: true, roomId: created.room.definition.id, proposal: plan.proposal, clamps: plan.clamps };
    },

    async adjust(roomId, instruction) {
      const asked = instruction.trim();
      if (!asked) return { ok: false, error: 'Say what to change.' };
      const record = await store.readRoom(roomId);
      if (!record) return { ok: false, error: `Room not found: ${roomId}` };
      if (!PLANNABLE.includes(record.runtime.status)) {
        return {
          ok: false,
          error: 'This Room has already started. Ask the Conductor for a change instead — a running team changes through a revision.',
        };
      }

      const outcome = await adjustRoom(host, {
        blueprint: record.definition.blueprint,
        instruction: asked,
        parentSessionId: roomPlannerSessionId(workspaceId),
        // The approved envelope is the ceiling. An adjustment can move within
        // it and never above it, whatever the instruction asks for.
        envelope: record.definition.envelope,
      });
      if (!outcome.ok) return { ok: false, error: outcome.errors.join('; ') };

      // A draft holds no runtime state — no messages, no work, no usage — so the
      // record is rebuilt from the new blueprint through the same function that
      // built the first one, rather than patched member by member. The identity
      // is kept: the user is still looking at this Room.
      const rebuilt = buildRoomRecord(host, {
        id: roomId,
        problemStatement: record.definition.problemStatement,
        blueprint: outcome.blueprint,
        proposal: outcome.proposal,
        workspaceId,
        originSessionId: record.delivery.originSessionId,
        deliveryParams: record.delivery.params,
      });
      await store.updateRoom(roomId, (current) => ({
        ...rebuilt,
        definition: { ...rebuilt.definition, createdAt: current.definition.createdAt },
      }));
      return { ok: true, roomId, proposal: outcome.proposal, clamps: outcome.clamps };
    },

    async start(roomId) {
      return settled(await coordinator.startRoom(roomId));
    },

    async pause(roomId, detail) {
      return settled(await coordinator.pauseRoom(roomId, detail));
    },

    async resume(roomId) {
      return settled(await coordinator.resumeRoom(roomId));
    },

    async cancel(roomId, detail) {
      return settled(await coordinator.cancelRoom(roomId, detail));
    },

    async remove(roomId) {
      return settled(await coordinator.deleteRoom(roomId));
    },

    async resolveApproval(roomId, approvalId, decision) {
      const outcome = await coordinator.resolveApproval(roomId, approvalId, decision);
      return outcome.ok ? { ok: true } : { ok: false, error: outcome.reason ?? 'That approval could not be answered.' };
    },

    async intervene(roomId, body, memberIds, wake = true) {
      const said = body.trim();
      if (!said) return { ok: false, error: 'Write what you want to tell the Room.' };
      return withRoom(roomId, async (status) => {
        const finished = stopped(status);
        if (finished) return finished;
        const record = await store.readRoom(roomId);
        if (!record) return { ok: false, error: `Room not found: ${roomId}` };
        const active = record.members.filter((member) => member.status !== 'retired');
        const targets = memberIds?.length
          ? active.filter((member) => memberIds.includes(member.id))
          : active;
        if (targets.length === 0) return { ok: false, error: 'There is nobody in this Room to tell.' };

        await store.appendMessages(roomId, [{
          id: host.newId('msg'),
          kind: 'system',
          fromMemberId: null,
          toMemberIds: targets.map((member) => member.id),
          body: said,
          questionId: null,
          inReplyToQuestionId: null,
          // An interruption is the default: a queued one would arrive after the
          // thing it was meant to stop. A note the user is not waiting on rides
          // along with the member's next turn instead.
          wakeRecipients: wake,
          commandId: host.newId('cmd'),
          createdAt: host.now(),
        }]);
        if (wake) {
          for (const member of targets) await coordinator.wake(roomId, member.id, 'user-intervention');
        }
        return { ok: true };
      });
    },

    async timeline(roomId, limit = TIMELINE_PAGE) {
      return store.readTimeline(roomId, Math.max(1, Math.min(limit, TIMELINE_PAGE)));
    },

    async answer(roomId, memberId, body) {
      const said = body.trim();
      if (!said) return { ok: false, error: 'Write the answer.' };
      return withRoom(roomId, async (status) => stopped(status) ?? settleWait(roomId, memberId, (questionId) => ({
        kind: 'system' as const,
        body: said,
        questionId: null,
        inReplyToQuestionId: questionId,
      })));
    },

    async release(roomId, memberId) {
      return withRoom(roomId, async (status) => stopped(status) ?? settleWait(roomId, memberId, (questionId) => ({
        kind: 'cancel' as const,
        body: 'That question will not be answered. Carry on without it.',
        questionId,
        inReplyToQuestionId: null,
      })));
    },

    async wake(roomId, memberId) {
      return withRoom(roomId, async (status) => {
        const finished = stopped(status);
        if (finished) return finished;
        // Only a running Room takes turns. Saying "awake" while it is paused
        // would claim something the scheduler will not do until it resumes.
        if (status !== 'running') {
          return { ok: false, error: 'This Room is not running, so nobody can take a turn yet.' };
        }
        const member = await store.readMember(roomId, memberId);
        // A member that finished or failed has no session left to wake.
        if (!member || WAKEABLE.includes(member.status) === false) {
          return { ok: false, error: `${memberId} is not a member this Room can put back to work.` };
        }
        await coordinator.wake(roomId, memberId, 'user-intervention');
        return { ok: true };
      });
    },
  };
}
