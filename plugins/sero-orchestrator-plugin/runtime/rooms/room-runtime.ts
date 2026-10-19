/**
 * Assembles the Room half of the Orchestrator runtime.
 *
 * Split from runtime/index.ts so that file stays small and so the Room wiring —
 * store, session pool, observation, coordinator — reads as one unit.
 *
 * Room mode is enabled unless the kill switch is set or the host does not
 * support it. A build or plugin that does not pass the built-in gate gets
 * `host.persistentSessions === undefined`. Either miss returns null — no
 * coordinator, no tick, and no Room state is written.
 */

import type { AppRuntimeContext } from '@sero-ai/common';

import type { OrchestratorHost } from '../host';
import { createMemberSessionPool } from './member-session';
import { createRoomAppActions, type RoomAppActions } from './room-app-actions';
import { createRoomClaims, type RoomClaims } from './room-claims';
import { RoomCoordinator } from './room-coordinator';
import { saveActiveTime } from './room-reconcile';
import { createRoomObservation } from './room-observation';
import { createRoomStore } from './room-store';
import { createRoomRuntimeTelemetry } from './room-telemetry';
import { createRoomCommandRouter, type RoomCommandRouter } from './room-command-router';
import { requestDeliveryApproval } from './room-delivery';
import { applyRevisionToRoom } from './room-revision-mutate';
import { createRoomAmendments, type RoomAmendments } from './room-amendment';
import { applyRoomRevision } from './room-revisions';
import { createRoomWork, type RoomWork } from './room-work';
import { createRoomWorkspaces, type RoomWorkspaces } from './room-workspace';
import type { RoomObservation } from './room-observation';

export interface RoomRuntime {
  coordinator: RoomCoordinator;
  observation: RoomObservation;
  /** The AD-020 command surface a member reaches through `sero-cli`. */
  commands: RoomCommandRouter;
  /** The user's control surface, which the Room panel drives. */
  app: RoomAppActions;
  /** Placement, checkpoints and commit collection for the Room's members. */
  workspaces: RoomWorkspaces;
  /** Work records and artifacts. */
  work: RoomWork;
  /** Advisory path claims. */
  claims: RoomClaims;
  /** Grant amendments for running Rooms: pending, held, approved, declined. */
  amendments: RoomAmendments;
  /** Restart recovery. Runs before any scheduling, as the Workflow side does. */
  reconcile(): Promise<void>;
  /** Recovery pass only — the normal wake path is the coordinator's event path. */
  tick(): Promise<void>;
  /** Banks every Room's active time before the runtime closes. */
  shutdown(): Promise<void>;
}

/**
 * The emergency kill switch. Rooms are on by default. Set `SERO_ROOMS=0` or
 * `false` before Sero starts to disable the complete Room runtime without
 * deleting its data.
 */
export function roomModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.SERO_ROOMS?.trim().toLowerCase();
  return flag !== '0' && flag !== 'false';
}

export function createRoomRuntime(
  ctx: AppRuntimeContext,
  host: OrchestratorHost,
): RoomRuntime | null {
  if (!roomModeEnabled()) return null;
  // The one hard prerequisite. Without the capability a Room cannot create a
  // member session, so standing up a coordinator that could only fail would be
  // worse than not having one.
  if (!ctx.host.persistentSessions) return null;

  const store = createRoomStore(ctx);
  const observation = createRoomObservation({
    sessions: ctx.host.persistentSessions,
    now: () => host.now(),
    ...(host.feedback ? { feedback: { projection: host.feedback, scope: { appId: ctx.appId, workspaceId: ctx.workspaceId } } } : {}),
  });
  const sessions = createMemberSessionPool({ host, store, observation });
  const work = createRoomWork({ host, store });
  const claims = createRoomClaims({ host, store });
  const workspaces = createRoomWorkspaces({ host, store });
  // The brief is computed from current records, and work and artifacts are two
  // of them — without this the brief would keep reporting a Room with no work.
  const coordinator = new RoomCoordinator(host, {
    store,
    sessions,
    telemetry: createRoomRuntimeTelemetry((message) => host.log(message)),
    // The SAME instance the runtime exposes, so placement, checkpoints and
    // commit collection all act on one view of the Room's checkouts.
    workspaces,
    briefSources: (roomId) => work.briefSources(roomId),
  });

  // A system message, not a peer message: the Room is telling a member what
  // changed, and nothing about it can be answered or argued with.
  const notify = async (roomId: string, memberIds: string[], summary: string): Promise<void> => {
    await store.appendMessages(roomId, [{
      id: host.newId('msg'),
      kind: 'system',
      fromMemberId: null,
      toMemberIds: memberIds,
      body: summary,
      questionId: null,
      inReplyToQuestionId: null,
      // The change is already in the member's mandate, which every turn
      // carries, so waking it now would only cost a turn.
      wakeRecipients: false,
      commandId: host.newId('cmd'),
      createdAt: host.now(),
    }]);
  };
  const amendments = createRoomAmendments({
    host,
    store,
    sessions,
    notify,
    resume: (roomId) => coordinator.advance(roomId),
  });

  // AD-020: one command surface for every logical Room operation, routed to the
  // module that already owns it. Nothing new is implemented for the bridge.
  const commands = createRoomCommandRouter({
    host,
    store,
    mailbox: coordinator.mailbox,
    claims,
    work,
    applyRevision: (input) =>
      applyRoomRevision(
        {
          host,
          store,
          mutate: applyRevisionToRoom,
          releaseMemberSession: (roomId, memberId) => sessions.release(roomId, memberId),
          notify,
          amendments,
        },
        input,
      ),
    // The Conductor's delivery flow: ask the user, then finish with the proof.
    // Both ends run against the SAME store the approval was written to, so the
    // binding checked at delivery is the one the user answered.
    workspaces,
    requestDeliveryApproval: (request) => requestDeliveryApproval({ host, store }, request),
    completeRoom: (roomId, summary, receipt) => coordinator.completeRoom(roomId, summary, receipt),
    publishConductorNote: (roomId, note) => coordinator.publishConductorNote(roomId, note),
    noteStructuralProgress: (roomId, summary, recordEvent) =>
      coordinator.noteStructuralProgress(roomId, summary, recordEvent),
  });

  return {
    coordinator,
    observation,
    commands,
    app: createRoomAppActions({ host, store, coordinator, amendments, workspaceId: ctx.workspaceId, observation, sessions: ctx.host.persistentSessions }),
    workspaces,
    work,
    claims,
    amendments,
    // Members' sessions are reset first, then every revision still pending is
    // finished. A member with a pending change stays unschedulable throughout.
    reconcile: async () => {
      await coordinator.reconcileRooms();
      await amendments.reconcile();
    },
    // The checkpoint rides the recovery tick that already runs, so a running
    // Room needs no timer of its own.
    tick: async () => {
      await saveActiveTime({ host, store }, false);
      await coordinator.tick();
    },
    shutdown: () => saveActiveTime({ host, store }, true),
  };
}
