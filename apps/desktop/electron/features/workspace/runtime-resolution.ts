import type { ContainerManager, ContainerState } from '@electron/features/container';
import type { WorkspaceManager } from './manager';

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

type RuntimeResolutionManagers = Pick<WorkspaceManager, 'getPath' | 'isContainerEnabled'>
  & Pick<ContainerManager, 'hasContainer' | 'inspect'>;

function getContainerFallbackReason(workspaceId: string, detail?: string): string {
  const suffix = detail ? ` ${detail}` : '';
  return `Container mode is enabled for workspace ${workspaceId}, but no running container is available. Sero is falling back to host mode until the container is ready again.${suffix}`;
}

async function getRunningContainerState(
  workspaceId: string,
  manager: Pick<ContainerManager, 'hasContainer' | 'inspect'>,
): Promise<ContainerState | null> {
  if (!manager.hasContainer(workspaceId)) {
    return null;
  }

  try {
    const state = await manager.inspect(workspaceId);
    return state.state === 'running' ? state : null;
  } catch {
    return null;
  }
}

export async function resolveWorkspaceRuntimeWithManagers(
  workspaceId: string,
  managers: RuntimeResolutionManagers,
): Promise<WorkspaceRuntimeResolution> {
  const workspacePath = managers.getPath(workspaceId);
  if (!workspacePath) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  const containerEnabled = await managers.isContainerEnabled(workspaceId);
  if (!containerEnabled) {
    return {
      workspaceId,
      workspacePath,
      desiredRuntime: 'host',
      actualRuntime: 'host',
      containerEnabled,
    };
  }

  const containerState = await getRunningContainerState(workspaceId, managers);
  if (containerState) {
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

export async function resolveWorkspaceRuntime(
  workspaceId: string,
): Promise<WorkspaceRuntimeResolution> {
  const [{ workspaceManager }, { containerManager }] = await Promise.all([
    import('@electron/features/workspace/manager'),
    import('@electron/features/container/core/singleton'),
  ]);

  return resolveWorkspaceRuntimeWithManagers(workspaceId, {
    getPath: workspaceManager.getPath.bind(workspaceManager),
    isContainerEnabled: workspaceManager.isContainerEnabled.bind(workspaceManager),
    hasContainer: containerManager.hasContainer.bind(containerManager),
    inspect: containerManager.inspect.bind(containerManager),
  });
}
