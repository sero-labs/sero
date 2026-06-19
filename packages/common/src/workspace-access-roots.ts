export type WorkspaceAccessRootKind =
  | 'primary'
  | 'workspace-reference'
  | 'folder-mount'
  | 'additional-root'
  | 'linked-plugin';

export type WorkspaceAccessRootRuntimeBackend = 'host' | 'docker' | 'apple-container';
export type WorkspaceAccessRootRuntimeMode = 'host' | 'container';

export interface WorkspaceAccessRoot {
  id: string;
  name: string;
  kind: WorkspaceAccessRootKind;
  hostPath: string;
  runtimePath: string;
  writable: boolean;
  source?: {
    workspaceId?: string;
    rootId?: string;
  };
}

export interface WorkspaceAccessRootsResult {
  workspaceId: string;
  runtime: {
    backend: WorkspaceAccessRootRuntimeBackend;
    mode: WorkspaceAccessRootRuntimeMode;
  };
  roots: WorkspaceAccessRoot[];
  warnings: string[];
}
