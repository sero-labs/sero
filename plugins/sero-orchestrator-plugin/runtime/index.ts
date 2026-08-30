/**
 * Orchestrator app runtime — runs in Electron main inside the workspace app
 * runtime. It owns the per-workspace coordinator and publishes it to the shared
 * registry so bridged extension tools/commands can request actions.
 */

import type { AppRuntime, AppRuntimeContext, AppRuntimeModule } from '@sero-ai/common';
import { Coordinator } from './coordinator';
import { createOrchestratorHost } from './host-adapter';
import { registerCoordinator, unregisterCoordinator } from './registry';
import { LoopLocks } from './locks';
import { createEngineDeps } from './executors';
import { llmStopChecker } from './stop-condition';
import { attachDemandSync, EventSourceManager } from './events/manager';
import type { EmitEvent, EventSourceAdapter } from './events/types';
import { createFsAdapter } from './events/fs-adapter';
import { createGithubAdapter } from './events/github-adapter';
import { createWebhookAdapter } from './events/webhook-adapter';
import { createRoomRuntime } from './rooms/room-runtime';
import { createGoalRuntime } from './goals';
import { SessionDrivers } from './session-drivers';
import {
  registerGoalRuntime,
  registerRoomCoordinator,
  unregisterGoalRuntime,
  unregisterRoomCoordinator,
} from './registry';

/** Coarse scheduler tick — cron triggers are minute-resolution. */
const TICK_INTERVAL_MS = 60_000;

export function createAppRuntime(ctx: AppRuntimeContext): AppRuntime {
  // Event source adapters do background work ONLY while an active loop
  // subscribes to their namespace. Internal loop:* events are
  // coordinator-emitted, not an adapter.
  const adapters: EventSourceAdapter[] = [];
  const manager = new EventSourceManager(adapters);
  // Every persisted mutation pushes the new state into the manager, so adapter
  // demand follows loop state with no file watching and no timers.
  const host = attachDemandSync(createOrchestratorHost(ctx), manager);
  // One autonomous driver per chat session (D06). Active-session Workflow steps
  // and Goal mode share this arbiter, so the second one is refused with a
  // reason instead of interleaving steers with the first.
  const drivers = new SessionDrivers();
  const coordinator = new Coordinator(
    host,
    createEngineDeps(new LoopLocks(), { stopChecker: llmStopChecker, sessionDrivers: drivers }),
  );
  const emit: EmitEvent = (event) => coordinator.fireEvent(event).then(() => undefined);
  adapters.push(createFsAdapter(host, emit), createWebhookAdapter(host, emit), createGithubAdapter(host, emit));
  // Room mode is inert without the AD-029 host capability, so this is null on a
  // build or a plugin that does not pass the built-in gate. Workflow mode is
  // unaffected either way.
  const rooms = createRoomRuntime(ctx, host);
  // Goal mode is the third Orchestrator mode. It needs no host capability that
  // Workflow mode does not, so it is null only when the kill switch is set.
  const goals = createGoalRuntime(ctx, host, drivers);
  let tickTimer: ReturnType<typeof setInterval> | undefined;

  return {
    start: async () => {
      registerCoordinator(ctx.workspaceId, ctx.workspacePath, coordinator);
      if (rooms) registerRoomCoordinator(ctx.workspaceId, rooms.coordinator, rooms.commands, rooms.app);
      if (goals) registerGoalRuntime(ctx.workspaceId, goals);
      // Restart recovery: reconcile orphaned runs/attempts before any scheduling.
      await coordinator.reconcile();
      // Rooms reconcile on the same rule — recover in-flight state before any
      // member is given a turn.
      if (rooms) await rooms.reconcile();
      // Goals re-check their budgets before anything resumes, so a goal that
      // exhausted one while Sero was closed comes back limited, not running.
      if (goals) await goals.reconcile();
      // Adapters see the initial demand even if reconcile wrote nothing.
      const initial = await host.readState();
      if (initial) manager.notifyState(initial);
      // Catch-up: collapse missed cron fires into one run on open.
      await coordinator.tick();
      tickTimer = setInterval(() => {
        void coordinator.tick();
        // Recovery only. A Room's normal wake is the coordinator's event path
        // (spec §16) — this catches a Room that missed one.
        if (rooms) void rooms.tick();
      }, TICK_INTERVAL_MS);
      host.log(`runtime started for workspace ${ctx.workspaceId}`);
    },
    handleStateChange: () => {
      // State is the authoritative source; the coordinator reads it on demand.
    },
    dispose: () => {
      if (tickTimer) clearInterval(tickTimer);
      manager.dispose();
      unregisterCoordinator(ctx.workspaceId);
      unregisterRoomCoordinator(ctx.workspaceId);
      unregisterGoalRuntime(ctx.workspaceId);
    },
  };
}

const runtimeModule: AppRuntimeModule = { createAppRuntime };
export default runtimeModule;
