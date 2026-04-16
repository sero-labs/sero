import type { SubagentManager } from '@electron/features/subagent';

export interface OrchestratorDeps {
  subagentManager: SubagentManager;
  getWorkspacePath: (workspaceId: string) => string | null;
  findWorkspaceByPath: (absPath: string) => { id: string; path: string } | null;
}
