import type { KanbanRuntimeHost } from '../types';

export interface OrchestratorDeps {
  host: KanbanRuntimeHost;
  workspaceId: string;
  workspacePath: string;
  stateFilePath: string;
  getWorkspacePath: (workspaceId: string) => string | null;
  findWorkspaceByPath: (absPath: string) => { id: string; path: string } | null;
}
