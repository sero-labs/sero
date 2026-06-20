// Background runtime entry — the only place with the full `host.*` surface and
// therefore the home of the single executor (00-architecture.md). On start it
// registers a workspace coordinator into the process-wide registry so bridged
// extension tools/commands (which receive no `host.*`) can reach it, then runs
// catch-up-on-open scheduling (Phase 2.5); on dispose it unregisters. The live
// per-minute cron tick, event subscriptions, and execution adapters land in
// later phases.

import type {
  AppRuntime,
  AppRuntimeContext,
  AppRuntimeModule,
} from '@sero-ai/common';

import { getOrchestratorRegistry } from '../shared/registry';
import { WorkspaceCoordinator } from './coordinator';

class OrchestratorRuntime implements AppRuntime {
  private readonly coordinator: WorkspaceCoordinator;

  constructor(private readonly ctx: AppRuntimeContext) {
    this.coordinator = new WorkspaceCoordinator({
      host: ctx.host,
      workspaceId: ctx.workspaceId,
      workspacePath: ctx.workspacePath,
      stateFilePath: ctx.stateFilePath,
    });
  }

  async start(): Promise<void> {
    // Register synchronously (before the first await) so bridged tools/commands
    // can reach the coordinator the moment the runtime starts.
    getOrchestratorRegistry().register(
      this.ctx.workspaceId,
      this.ctx.workspacePath,
      this.coordinator,
    );
    // Catch-up-on-open (Phase 2.5, D-04): run any cron loop that came due while
    // the workspace was closed. Awaiting this waits only for the reconcile +
    // dispatch — the runs themselves complete asynchronously, so startup is never
    // blocked by attempt execution (which lands in Phase 3/4).
    try {
      await this.coordinator.catchUpOnOpen();
    } catch (err) {
      console.error('[orchestrator] catch-up-on-open failed', err);
    }
  }

  handleStateChange(_state: unknown): void {
    // No reconcile work here. Catch-up runs once on start(); the live cron tick
    // and event subscriptions are Phase 5. State changes are driven by the
    // coordinator, so reacting to them here would be redundant (and recursive).
  }

  dispose(): void {
    getOrchestratorRegistry().unregister(this.ctx.workspaceId);
  }
}

export function createAppRuntime(ctx: AppRuntimeContext): AppRuntime {
  return new OrchestratorRuntime(ctx);
}

export default {
  createAppRuntime,
} satisfies AppRuntimeModule;
