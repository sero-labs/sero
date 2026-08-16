/**
 * Assembles the Room half of the Orchestrator runtime.
 *
 * Split from runtime/index.ts so that file stays small and so the Room wiring —
 * store, session pool, observation, coordinator — reads as one unit.
 *
 * Room mode is **inert unless it is switched on AND the host supports it**. The
 * rollout flag is checked first, then the AD-029 capability: a build or a plugin
 * that does not pass the built-in gate gets `host.persistentSessions ===
 * undefined`. Either miss returns null — no coordinator, no tick, no state
 * written. That is the intended shape; Workflow mode is unaffected either way.
 */

import type { AppRuntimeContext } from '@sero-ai/common';

import type { OrchestratorHost } from '../host';
import { createMemberSessionPool } from './member-session';
import { createRoomAppActions, type RoomAppActions } from './room-app-actions';
import { createRoomClaims, type RoomClaims } from './room-claims';
import { RoomCoordinator } from './room-coordinator';
import { createRoomObservation } from './room-observation';
import { createRoomStore } from './room-store';
import { createRoomRuntimeTelemetry } from './room-telemetry';
import { createRoomCommandRouter, type RoomCommandRouter } from './room-command-router';
import { requestDeliveryApproval } from './room-delivery';
import { applyRevisionToRoom } from './room-revision-mutate';
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
  /** Restart recovery. Runs before any scheduling, as the Workflow side does. */
  reconcile(): Promise<void>;
  /** Recovery pass only — the normal wake path is the coordinator's event path. */
  tick(): Promise<void>;
}

/**
 * The rollout gate. Room mode ships dark: a build carries the code, and a
 * profile that has not switched it on behaves exactly like Workflow-only Sero.
 *
 * Set `SERO_ROOMS=1` (or `true`) to switch it on. It is deliberately a single
 * gate in front of the whole runtime rather than a check at each entry point —
 * there is no half-enabled Room mode to reason about, and Phase 9 removes it by
 * deleting these lines.
 */
export function roomModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.SERO_ROOMS?.trim().toLowerCase();
  return flag === '1' || flag === 'true';
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
          // A system message, not a peer message: the Room is telling a member
          // what changed, and nothing about it can be answered or argued with.
          notify: async (roomId, memberIds, summary) => {
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
          },
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
    app: createRoomAppActions({ host, store, coordinator, workspaceId: ctx.workspaceId, observation, sessions: ctx.host.persistentSessions }),
    workspaces,
    work,
    claims,
    reconcile: () => coordinator.reconcileRooms(),
    tick: () => coordinator.tick(),
  };
}
