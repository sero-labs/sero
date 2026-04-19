import type {
  AppRuntime,
  AppRuntimeModule,
  KanbanRuntimeContext,
} from './types';
import type { KanbanState } from './core/types';
import type { OrchestratorDeps } from './core/orchestrator-types';
import { KanbanOrchestrator } from './core/orchestrator';

function createOrchestratorDeps(ctx: KanbanRuntimeContext): OrchestratorDeps {
  return {
    host: ctx.host,
    workspaceId: ctx.workspaceId,
    workspacePath: ctx.workspacePath,
    stateFilePath: ctx.stateFilePath,
    getWorkspacePath: (workspaceId) => (workspaceId === ctx.workspaceId ? ctx.workspacePath : null),
    findWorkspaceByPath: (absPath) => (
      absPath === ctx.workspacePath
        ? { id: ctx.workspaceId, path: ctx.workspacePath }
        : null
    ),
  };
}

export class KanbanRuntime implements AppRuntime {
  private readonly orchestrator: KanbanOrchestrator;

  constructor(readonly ctx: KanbanRuntimeContext) {
    this.orchestrator = new KanbanOrchestrator(createOrchestratorDeps(ctx));
  }

  async start(): Promise<void> {
    await this.orchestrator.watchWorkspace(this.ctx.workspaceId, this.ctx.workspacePath);
    await this.orchestrator.recoverStuckCards([{ id: this.ctx.workspaceId, path: this.ctx.workspacePath }]);
  }

  async handleStateChange(state: unknown): Promise<void> {
    if (!state || typeof state !== 'object') return;
    await this.orchestrator.onStateChange(this.ctx.stateFilePath, state as KanbanState);
  }

  async dispose(): Promise<void> {
    this.orchestrator.dispose();
  }
}

export function createAppRuntime(ctx: KanbanRuntimeContext): AppRuntime {
  return new KanbanRuntime(ctx);
}

export default {
  createAppRuntime,
} satisfies AppRuntimeModule;
