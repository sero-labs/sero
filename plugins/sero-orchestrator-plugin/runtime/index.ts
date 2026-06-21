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

/** Coarse scheduler tick — cron triggers are minute-resolution. */
const TICK_INTERVAL_MS = 60_000;

export function createAppRuntime(ctx: AppRuntimeContext): AppRuntime {
  const host = createOrchestratorHost(ctx);
  const coordinator = new Coordinator(host, createEngineDeps(new LoopLocks()));
  let tickTimer: ReturnType<typeof setInterval> | undefined;

  return {
    start: async () => {
      registerCoordinator(ctx.workspaceId, ctx.workspacePath, coordinator);
      // Restart recovery: reconcile orphaned runs/attempts before any scheduling.
      await coordinator.reconcile();
      // Catch-up: collapse missed cron fires into one run on open.
      await coordinator.tick();
      tickTimer = setInterval(() => {
        void coordinator.tick();
      }, TICK_INTERVAL_MS);
      host.log(`runtime started for workspace ${ctx.workspaceId}`);
    },
    handleStateChange: () => {
      // State is the authoritative source; the coordinator reads it on demand.
    },
    dispose: () => {
      if (tickTimer) clearInterval(tickTimer);
      unregisterCoordinator(ctx.workspaceId);
    },
  };
}

const runtimeModule: AppRuntimeModule = { createAppRuntime };
export default runtimeModule;
