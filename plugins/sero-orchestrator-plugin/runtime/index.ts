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
  const coordinator = new Coordinator(host, createEngineDeps(new LoopLocks(), { stopChecker: llmStopChecker }));
  const emit: EmitEvent = (event) => coordinator.fireEvent(event);
  adapters.push(createFsAdapter(host, emit), createWebhookAdapter(host, emit), createGithubAdapter(host, emit));
  let tickTimer: ReturnType<typeof setInterval> | undefined;

  return {
    start: async () => {
      registerCoordinator(ctx.workspaceId, ctx.workspacePath, coordinator);
      // Restart recovery: reconcile orphaned runs/attempts before any scheduling.
      await coordinator.reconcile();
      // Adapters see the initial demand even if reconcile wrote nothing.
      const initial = await host.readState();
      if (initial) manager.notifyState(initial);
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
      manager.dispose();
      unregisterCoordinator(ctx.workspaceId);
    },
  };
}

const runtimeModule: AppRuntimeModule = { createAppRuntime };
export default runtimeModule;
