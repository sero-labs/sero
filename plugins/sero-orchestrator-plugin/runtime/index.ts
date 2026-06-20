// Background runtime entry — the only place with the full `host.*` surface and
// therefore the home of the single executor (00-architecture.md). On start it
// registers a workspace coordinator into the process-wide registry so bridged
// extension tools/commands (which receive no `host.*`) can reach it; on dispose
// it unregisters. Scheduling/catch-up-on-open and execution adapters land in
// later phases — Phase 1 only stands up the coordinator and its state plumbing.

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

  start(): void {
    getOrchestratorRegistry().register(
      this.ctx.workspaceId,
      this.ctx.workspacePath,
      this.coordinator,
    );
  }

  handleStateChange(_state: unknown): void {
    // No reconcile work yet. Scheduling and catch-up-on-open (Phase 2.5) will
    // hook in here; for now the coordinator is the sole driver of state.
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
