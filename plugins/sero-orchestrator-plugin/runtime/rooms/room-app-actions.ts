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
import type { RoomStatus } from '../../shared/room-types';
import { findRoomTemplate, type RoomTemplate } from '../../shared/room-templates';
import type { OrchestratorHost } from '../host';
import { adjustRoom } from './adjust';
import { planRoom, type RoomUserLimits } from './planner';
import type { RoomPresetSeed } from './planner-prompt';
import { buildRoomRecord } from './room-actions';
import type { RoomCoordinator } from './room-coordinator';
import type { RoomStore } from './room-store';

/** Room states the user may still re-plan. Past this, changes go through a revision. */
const PLANNABLE: readonly RoomStatus[] = ['draft', 'ready'];

export interface RoomAppActionsContext {
  host: OrchestratorHost;
  store: RoomStore;
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

export interface RoomAppActions {
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
   */
  intervene(roomId: string, body: string, memberIds?: string[]): Promise<SimpleOutcome>;
  /** Puts one member back to work now rather than at its next turn. */
  wake(roomId: string, memberId: string): Promise<SimpleOutcome>;
}

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

  /** Every action but `prepare` names a Room, and a missing one is the same answer each time. */
  async function withRoom<T>(
    roomId: string,
    run: (status: RoomStatus) => Promise<T>,
  ): Promise<T | { ok: false; error: string }> {
    const record = await store.readRoom(roomId);
    if (!record) return { ok: false, error: `Room not found: ${roomId}` };
    return run(record.runtime.status);
  }

  /** The coordinator answers with the whole record; the user surface needs only the verdict. */
  const settled = (result: { ok: boolean; error?: string }): SimpleOutcome =>
    result.ok ? { ok: true } : { ok: false, error: result.error ?? 'That did not work.' };

  return {
    async prepare(input) {
      const problem = input.problem.trim();
      if (!problem) return { ok: false, error: 'Say what the Room is for.' };

      const template = input.presetId ? findRoomTemplate(input.presetId) : null;
      if (input.presetId && !template) return { ok: false, error: `There is no preset ${input.presetId}.` };

      const plan = await planRoom(host, {
        problem,
        parentSessionId: roomPlannerSessionId(workspaceId),
        limits: input.limits,
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

    async intervene(roomId, body, memberIds) {
      const said = body.trim();
      if (!said) return { ok: false, error: 'Write what you want to tell the Room.' };
      return withRoom(roomId, async () => {
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
          // The user is waiting on the answer, so this is the one message that
          // always wakes: a queued intervention would arrive after the thing it
          // was meant to stop.
          wakeRecipients: true,
          commandId: host.newId('cmd'),
          createdAt: host.now(),
        }]);
        for (const member of targets) await coordinator.wake(roomId, member.id, 'user-intervention');
        return { ok: true };
      });
    },

    async wake(roomId, memberId) {
      return withRoom(roomId, async () => {
        const member = await store.readMember(roomId, memberId);
        if (!member || member.status === 'retired') {
          return { ok: false, error: `${memberId} is not an active member of this Room.` };
        }
        await coordinator.wake(roomId, memberId, 'user-intervention');
        return { ok: true };
      });
    },
  };
}
