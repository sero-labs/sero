import { containerManager, workspaceManager } from '@electron/shared/infra/shared-infra';

export type WorkspaceRuntimeKind = 'container' | 'host';
export type WorkspaceRuntimeFallbackCode = 'container_unavailable';

export interface WorkspaceRuntimeResolution {
  workspaceId: string;
  workspacePath: string;
  desiredRuntime: WorkspaceRuntimeKind;
  actualRuntime: WorkspaceRuntimeKind;
  containerEnabled: boolean;
  fallbackCode?: WorkspaceRuntimeFallbackCode;
  fallbackReason?: string;
}

function getContainerFallbackReason(workspaceId: string): string {
  return `Container mode is enabled for workspace ${workspaceId}, but no running container is available. Sero is falling back to host mode until the container is ready again.`;
}

export async function resolveWorkspaceRuntime(
  workspaceId: string,
): Promise<WorkspaceRuntimeResolution> {
  const workspacePath = workspaceManager.getPath(workspaceId);
  if (!workspacePath) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  const containerEnabled = await workspaceManager.isContainerEnabled(workspaceId);
  if (!containerEnabled) {
    return {
      workspaceId,
      workspacePath,
      desiredRuntime: 'host',
      actualRuntime: 'host',
      containerEnabled,
    };
  }

  if (containerManager.hasContainer(workspaceId)) {
    return {
      workspaceId,
      workspacePath,
      desiredRuntime: 'container',
      actualRuntime: 'container',
      containerEnabled,
    };
  }

  return {
    workspaceId,
    workspacePath,
    desiredRuntime: 'container',
    actualRuntime: 'host',
    containerEnabled,
    fallbackCode: 'container_unavailable',
    fallbackReason: getContainerFallbackReason(workspaceId),
  };
}
