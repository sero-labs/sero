// Background runtime entry — the only place with the full `host.*` surface and
// therefore the home of the single executor (00-architecture.md). On start it
// registers a workspace coordinator into the process-wide registry so bridged
// extension tools/commands (which receive no `host.*`) can reach it, runs
// catch-up-on-open scheduling (Phase 2.5), then arms the live schedule (Phase 5):
// the smart cron alarm (one timer for the next due moment, not a poll) and the
// event-trigger subscriptions. State changes re-arm the schedule (push); on
// dispose it tears the schedule down and unregisters.

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
    // blocked by attempt execution.
    try {
      await this.coordinator.catchUpOnOpen();
    } catch (err) {
      console.error('[orchestrator] catch-up-on-open failed', err);
    }
    // Arm the live schedule (Phase 5): the smart cron alarm + event subscriptions.
    try {
      await this.coordinator.armSchedule();
    } catch (err) {
      console.error('[orchestrator] arming the schedule failed', err);
    }
  }

  async handleStateChange(_state: unknown): Promise<void> {
    // Re-arm the schedule on every state change (a push): a new/edited/paused
    // trigger resets the cron alarm to the next due moment and re-targets event
    // subscriptions. Re-arming only READS state, so this never recurses with the
    // coordinator's own writes.
    try {
      await this.coordinator.armSchedule();
    } catch (err) {
      console.error('[orchestrator] re-arming the schedule failed', err);
    }
  }

  dispose(): void {
    this.coordinator.disposeSchedule();
    getOrchestratorRegistry().unregister(this.ctx.workspaceId);
  }
}

export function createAppRuntime(ctx: AppRuntimeContext): AppRuntime {
  return new OrchestratorRuntime(ctx);
}

export default {
  createAppRuntime,
} satisfies AppRuntimeModule;
