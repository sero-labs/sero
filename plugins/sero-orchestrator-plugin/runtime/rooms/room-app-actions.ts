import { applyProjectSnapshot, roomSnapshotLimits } from '../project-models';
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

import { sameOrchestratorProjectAttribution, type OrchestratorRoomHandle } from '@sero-ai/common';
import { roomPlannerSessionId } from '../../shared/ids';
import type { RoomTimelineEvent } from '../../shared/room-message-types';
import { TERMINAL_ROOM_STATUSES, type MemberStatus, type RoomStatus } from '../../shared/room-types';
import { findRoomTemplate } from '../../shared/room-templates';
import { adjustRoom } from './adjust';
import { planRoom } from './planner';
import { buildRoomRecord } from './room-actions';
import type { RoomCoordinator } from './room-coordinator';
import { readRoomArtifact, type RoomArtifactReadOutcome } from './room-app-artifacts';
import { createRoomLiveActions, type RoomLiveActions, type RoomLiveContext } from './room-app-live';
import { limitsForOrigin, presetSeed, type PrepareRoomInput, type PrepareRoomOutcome } from './room-app-planning';
import type { RoomMessageDraft } from './room-messages';
import { mergeUsage, reportedUsage } from '../../shared/usage';

// How a planning request is shaped lives in its own module (500-LOC limit);
// re-exported so importers of this surface keep resolving it from one place.
export { limitsForOrigin, type PrepareRoomOutcome } from './room-app-planning';

/** Room states the user may still re-plan. Past this, changes go through a revision. */
const PLANNABLE: readonly RoomStatus[] = ['draft'];

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

export type SimpleOutcome = { ok: true } | { ok: false; error: string };

export interface RoomAppActions extends RoomLiveActions {
  inspect: OrchestratorRoomHandle['inspect'];
  /** Plans a team from one brief and drafts the Room. Nothing runs yet. */
  prepare(input: PrepareRoomInput): Promise<PrepareRoomOutcome>;
  /** Re-plans a draft in the user's own words. Refused once the Room has started. */
  adjust(roomId: string, instruction: string): Promise<PrepareRoomOutcome>;
  start(roomId: string): Promise<SimpleOutcome>;
  pause(roomId: string, detail?: string): Promise<SimpleOutcome>;
  resume(roomId: string, maxWallClockMs?: number): Promise<SimpleOutcome>;
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
  /**
   * One published artifact's own content, so the result view shows the plan in
   * place rather than sending the user to a file to find it.
   *
   * The artifact list already comes from the Room record, so this answers only
   * what the record cannot: what the file says, or why it cannot be shown.
   */
  readArtifact(roomId: string, artifactId: string): Promise<RoomArtifactReadOutcome>;
}

/** One screen of history. More than this is an audit question, not a panel question. */
const TIMELINE_PAGE = 100;

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

    async inspect(roomId) {
      const record = await store.readRoom(roomId);
      if (!record) return null;
      return {
        status: record.runtime.status,
        // Completion writes the Conductor's final answer to member status in
        // the same durable transaction that stops execution.
        result: record.runtime.status === 'completed' ? record.members.find((member) => member.isConductor)?.statusDetail ?? null : null,
        models: record.members.map((member) => ({ name: member.displayName, model: member.configuration.model, thinking: member.configuration.thinking })),
      };
    },

    async prepare(input) {
      const problem = input.problem.trim();
      if (!problem) return { ok: false, error: 'Say what the Room is for.' };
      if (input.requestId) {
        const existing = (await store.readState()).rooms.find((room) => room.definition.creationRequestId === input.requestId);
        if (existing) {
          if (existing.definition.problemStatement !== problem) return { ok: false, error: 'This creation request belongs to a different Room mandate.' };
          if (!sameOrchestratorProjectAttribution(existing.definition.projectContext, input.project)) {
            return { ok: false, error: 'This creation request belongs to a different project.' };
          }
          return { ok: true, roomId: existing.definition.id, proposal: existing.definition.proposal, clamps: [], usage: reportedUsage(existing.runtime.planningUsage), status: existing.runtime.status };
        }
      }

      const template = input.presetId ? findRoomTemplate(input.presetId) : null;
      if (input.presetId && !template) return { ok: false, error: `There is no preset ${input.presetId}.` };

      const requestId = input.requestId ?? host.newId('room-planning');
      const selection = applyProjectSnapshot(input.project?.modelSnapshot, undefined);
      const plan = await planRoom(host, {
        model: selection.model, thinking: selection.thinking,
        problem,
        parentSessionId: roomPlannerSessionId(workspaceId),
        limits: { ...roomSnapshotLimits(input.project?.modelSnapshot), ...limitsForOrigin(input) },
        clarifications: input.clarifications,
        preset: template ? presetSeed(template) : undefined,
        onUsage: (usage) => store.updatePendingPlanning(requestId, usage),
      });
      if (!plan.ok) {
        const usage = reportedUsage(await store.readPendingPlanning(requestId));
        return plan.needsInput
          ? { ok: false, needsInput: true, questions: plan.questions, usage }
          : { ok: false, error: plan.errors.join('; '), usage };
      }
      const pendingUsage = await store.readPendingPlanning(requestId);
      const planningUsage = pendingUsage ?? plan.usage;

      const created = await coordinator.createRoom({
        problemStatement: problem,
        requestId,
        blueprint: plan.blueprint,
        proposal: plan.proposal,
        workspaceId,
        originSessionId: input.originSessionId ?? null,
        planningUsage,
        ...(input.project ? { project: input.project } : {}),
      });
      if (!created.ok || !created.room) {
        return { ok: false, error: created.error ?? 'The team was planned but the Room could not be drafted.', usage: reportedUsage(planningUsage) };
      }
      await store.consumePendingPlanning(requestId);
      return { ok: true, roomId: created.room.definition.id, proposal: plan.proposal, clamps: plan.clamps, usage: reportedUsage(planningUsage) };
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

      const claimed = await store.transact(roomId, null, (current) => {
        const canAdjust = PLANNABLE.includes(current.runtime.status)
          && current.definition.updatedAt === record.definition.updatedAt;
        return {
          record: canAdjust
            ? { ...current, runtime: { ...current.runtime, status: 'adjusting' as const } }
            : null,
          result: canAdjust,
        };
      }).catch(() => null);
      if (!claimed || claimed.duplicate || !claimed.result) {
        return { ok: false, error: 'This Room changed before the adjustment started. Make a new plan from its current state.' };
      }

      const selection = applyProjectSnapshot(record.definition.projectContext?.modelSnapshot, undefined);
      const outcome = await adjustRoom(host, {
        model: selection.model, thinking: selection.thinking,
        blueprint: record.definition.blueprint,
        instruction: asked,
        parentSessionId: roomPlannerSessionId(workspaceId),
        // The approved envelope is the ceiling. An adjustment can move within
        // it and never above it, whatever the instruction asks for.
        envelope: record.definition.envelope,
        onUsage: (usage) => store.updateRoom(roomId, (current) => ({
          ...current,
          runtime: { ...current.runtime, planningUsage: mergeUsage(current.runtime.planningUsage, usage),
            usage: { ...current.runtime.usage,
              costUsd: current.runtime.usage.costUsd + (usage.costUsd ?? 0),
              inputTokens: current.runtime.usage.inputTokens + (usage.inputTokens ?? 0),
              outputTokens: current.runtime.usage.outputTokens + (usage.outputTokens ?? 0),
            },
          },
        })),
      });
      if (!outcome.ok) {
        await store.transact(roomId, null, (current) => ({
          record: current.runtime.status === 'adjusting'
            ? { ...current, runtime: { ...current.runtime, status: record.runtime.status } }
            : null,
          result: null,
        })).catch(() => undefined);
        return { ok: false, error: outcome.errors.join('; '), usage: outcome.usage };
      }

      // A draft retains planning usage but has no member work, so the
      // record is rebuilt from the new blueprint through the same function that
      // built the first one, rather than patched member by member. The identity
      // is kept: the user is still looking at this Room.
      const currentRecord = (await store.readRoom(roomId)) ?? record;
      const rebuilt = buildRoomRecord(host, {
        id: roomId,
        requestId: record.definition.creationRequestId,
        problemStatement: record.definition.problemStatement,
        blueprint: outcome.blueprint,
        proposal: outcome.proposal,
        workspaceId,
        originSessionId: record.delivery.originSessionId,
        deliveryParams: record.delivery.params,
        planningUsage: currentRecord.runtime.planningUsage,
        ...(record.definition.projectContext ? { project: record.definition.projectContext } : {}),
      });
      const committed = await store.transact(roomId, null, (current) => ({
        record: current.runtime.status === 'adjusting'
          ? {
              ...rebuilt,
              definition: { ...rebuilt.definition, createdAt: current.definition.createdAt },
            }
          : null,
        result: current.runtime.status === 'adjusting',
      })).catch(() => null);
      if (!committed || committed.duplicate || !committed.result) {
        return { ok: false, error: 'This Room changed while the adjustment was planned. Make a new plan from its current state.' };
      }
      return { ok: true, roomId, proposal: outcome.proposal, clamps: outcome.clamps, usage: reportedUsage(currentRecord.runtime.planningUsage) };
    },

    async start(roomId) {
      return settled(await coordinator.startRoom(roomId));
    },

    async pause(roomId, detail) {
      return settled(await coordinator.pauseRoom(roomId, detail));
    },

    async resume(roomId, maxWallClockMs) {
      const result = await coordinator.resumeRoom(roomId, maxWallClockMs);
      return result.ok && result.room?.runtime.status === 'paused'
        ? { ok: false, error: result.room.runtime.stopReason?.detail ?? 'The Room is still paused.' } : settled(result);
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
        // The Room stopped BECAUSE it was waiting for this. A message that
        // leaves it paused would answer the question and change nothing, so the
        // answer restarts it — and only for that one stop reason: a Room the
        // user paused stays paused whatever else they say to it.
        if (record.runtime.stopReason?.kind === 'awaiting-user' && record.runtime.status === 'paused') {
          await coordinator.resumeRoom(roomId);
        }
        return { ok: true };
      });
    },

    async timeline(roomId, limit = TIMELINE_PAGE) {
      return store.readTimeline(roomId, Math.max(1, Math.min(limit, TIMELINE_PAGE)));
    },

    async readArtifact(roomId, artifactId) {
      return readRoomArtifact({ host, store }, roomId, artifactId);
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
