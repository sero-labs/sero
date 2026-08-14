/**
 * Assembles the Room half of the Orchestrator runtime.
 *
 * Split from runtime/index.ts so that file stays small and so the Room wiring —
 * store, session pool, observation, coordinator — reads as one unit.
 *
 * Room mode is **inert without the host capability**. A build or a plugin that
 * does not pass the AD-029 built-in gate gets `host.persistentSessions ===
 * undefined`, and this returns null: no coordinator, no tick, no state written.
 * That is the intended shape — Workflow mode is unaffected either way.
 */

import type { AppRuntimeContext } from '@sero-ai/common';

import type { OrchestratorHost } from '../host';
import { createMemberSessionPool } from './member-session';
import { RoomCoordinator } from './room-coordinator';
import { createRoomObservation } from './room-observation';
import { createRoomStore } from './room-store';
import type { RoomObservation } from './room-observation';

export interface RoomRuntime {
  coordinator: RoomCoordinator;
  observation: RoomObservation;
  /** Restart recovery. Runs before any scheduling, as the Workflow side does. */
  reconcile(): Promise<void>;
  /** Recovery pass only — the normal wake path is the coordinator's event path. */
  tick(): Promise<void>;
}

export function createRoomRuntime(
  ctx: AppRuntimeContext,
  host: OrchestratorHost,
): RoomRuntime | null {
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
  const coordinator = new RoomCoordinator(host, { store, sessions });

  return {
    coordinator,
    observation,
    reconcile: () => coordinator.reconcileRooms(),
    tick: () => coordinator.tick(),
  };
}
