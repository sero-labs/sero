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

export function createAppRuntime(ctx: AppRuntimeContext): AppRuntime {
  const host = createOrchestratorHost(ctx);
  const coordinator = new Coordinator(host, createEngineDeps(new LoopLocks()));

  return {
    start: async () => {
      registerCoordinator(ctx.workspaceId, ctx.workspacePath, coordinator);
      // Restart recovery: reconcile orphaned runs/attempts before any scheduling.
      await coordinator.reconcile();
      host.log(`runtime started for workspace ${ctx.workspaceId}`);
    },
    handleStateChange: () => {
      // State is the authoritative source; the coordinator reads it on demand.
    },
    dispose: () => {
      unregisterCoordinator(ctx.workspaceId);
    },
  };
}

const runtimeModule: AppRuntimeModule = { createAppRuntime };
export default runtimeModule;
