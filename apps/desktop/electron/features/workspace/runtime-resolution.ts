import type { ContainerManager, ContainerState } from '@electron/features/container';
import type { WorkspaceManager } from './manager';

export type WorkspaceRuntimeKind = 'container' | 'host';
export type WorkspaceRuntimeFallbackCode = 'container_unavailable';
export type WorkspaceRuntimeCapabilityKey =
  | 'browserAutomation'
  | 'containerizedLanguageServers'
  | 'managedDevServers'
  | 'containerMounts';

export interface WorkspaceRuntimeCapabilityAuditEntry {
  key: WorkspaceRuntimeCapabilityKey;
  label: string;
  available: boolean;
  containerOnly: boolean;
  detail: string;
}

export interface WorkspaceRuntimeResolution {
  workspaceId: string;
  workspacePath: string;
  desiredRuntime: WorkspaceRuntimeKind;
  actualRuntime: WorkspaceRuntimeKind;
  containerEnabled: boolean;
  fallbackCode?: WorkspaceRuntimeFallbackCode;
  fallbackReason?: string;
  capabilityAudit: WorkspaceRuntimeCapabilityAuditEntry[];
}

type RuntimeResolutionManagers = Pick<WorkspaceManager, 'getPath' | 'isContainerEnabled'>
  & Pick<ContainerManager, 'hasContainer' | 'inspect'>;

function getContainerFallbackReason(workspaceId: string, detail?: string): string {
  const suffix = detail ? ` ${detail}` : '';
  return `Container mode is enabled for workspace ${workspaceId}, but no running container is available. Sero is falling back to host mode until the container is ready again.${suffix}`;
}

function createCapabilityAudit(
  actualRuntime: WorkspaceRuntimeKind,
  containerEnabled: boolean,
  fallbackReason?: string,
): WorkspaceRuntimeCapabilityAuditEntry[] {
  const hostModeReason = containerEnabled
    ? fallbackReason ?? 'Container mode is preferred, but this workspace is currently running on the host.'
    : 'Workspace is explicitly set to host mode, so this container-only feature stays unavailable.';

  return [
    {
      key: 'browserAutomation',
      label: 'Browser automation',
      available: actualRuntime === 'container',
      containerOnly: true,
      detail: actualRuntime === 'container'
        ? 'Browser / computer-use tooling is available because this workspace is running in a container.'
        : `${hostModeReason} Browser / computer-use tooling remains container-only.`,
    },
    {
      key: 'containerizedLanguageServers',
      label: 'Containerized language servers',
      available: actualRuntime === 'container',
      containerOnly: true,
      detail: actualRuntime === 'container'
        ? 'Language servers can run inside the workspace container.'
        : `${hostModeReason} Containerized LSP remains unavailable in host mode.`,
    },
    {
      key: 'managedDevServers',
      label: 'Managed preview/dev servers',
      available: actualRuntime === 'container',
      containerOnly: true,
      detail: actualRuntime === 'container'
        ? 'Managed preview and dev-server automation can target the workspace container.'
        : `${hostModeReason} Managed preview/dev-server automation remains container-only.`,
    },
    {
      key: 'containerMounts',
      label: 'Container mounts and references',
      available: actualRuntime === 'container',
      containerOnly: true,
      detail: actualRuntime === 'container'
        ? 'Workspace references and folder mounts apply immediately to the active container runtime.'
        : `${hostModeReason} Workspace references and mounts only take effect once the workspace is running in a container again.`,
    },
  ];
}

export function getRuntimeCapabilityEntry(
  runtime: WorkspaceRuntimeResolution,
  key: WorkspaceRuntimeCapabilityKey,
): WorkspaceRuntimeCapabilityAuditEntry {
  const entry = runtime.capabilityAudit.find((candidate) => candidate.key === key);
  if (!entry) {
    throw new Error(`Unknown workspace runtime capability: ${key}`);
  }
  return entry;
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
      capabilityAudit: createCapabilityAudit('host', containerEnabled),
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
      capabilityAudit: createCapabilityAudit('container', containerEnabled),
    };
  }

  const fallbackReason = getContainerFallbackReason(workspaceId);
  return {
    workspaceId,
    workspacePath,
    desiredRuntime: 'container',
    actualRuntime: 'host',
    containerEnabled,
    fallbackCode: 'container_unavailable',
    fallbackReason,
    capabilityAudit: createCapabilityAudit('host', containerEnabled, fallbackReason),
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
