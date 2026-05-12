import type { ContainerManager, ContainerState } from '@electron/features/container';
import type { RuntimeBackendId } from './runtime/types';
import { getRuntimeCapabilities, UnsupportedRuntimeOnPlatformError } from './runtime/capabilities';
import { getDefaultRuntimeBackend } from './runtime/platform-default';
import type { WorkspaceManager } from './manager';

export type WorkspaceRuntimeKind = 'container' | 'host';
export type WorkspaceRuntimeFallbackCode = 'container_unavailable' | 'backend-unsupported-on-platform';
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
  desiredBackend: RuntimeBackendId;
  actualBackend: RuntimeBackendId;
  containerEnabled: boolean;
  fallbackCode?: WorkspaceRuntimeFallbackCode;
  fallbackReason?: string;
  capabilityAudit: WorkspaceRuntimeCapabilityAuditEntry[];
}

type RuntimeResolutionManagers = Pick<WorkspaceManager, 'getPath' | 'getRuntimeConfig'>
  & Pick<ContainerManager, 'inspect'>;

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
  manager: Pick<ContainerManager, 'inspect'>,
): Promise<ContainerState | null> {
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

  const desiredBackend = (await managers.getRuntimeConfig(workspaceId)).backend;
  let validatedBackend = desiredBackend;
  let fallbackCode: WorkspaceRuntimeFallbackCode | undefined;
  let fallbackReason: string | undefined;

  try {
    getRuntimeCapabilities(desiredBackend, process.platform);
  } catch (error) {
    if (!(error instanceof UnsupportedRuntimeOnPlatformError)) throw error;
    validatedBackend = getDefaultRuntimeBackend({ platform: process.platform, arch: process.arch });
    fallbackCode = 'backend-unsupported-on-platform';
    fallbackReason = `${desiredBackend} is not supported on ${process.platform}. Sero is falling back to ${validatedBackend}.`;
    getRuntimeCapabilities(validatedBackend, process.platform);
  }

  const containerEnabled = validatedBackend !== 'host';
  if (!containerEnabled) {
    return {
      workspaceId,
      workspacePath,
      desiredRuntime: desiredBackend === 'host' ? 'host' : 'container',
      actualRuntime: 'host',
      desiredBackend,
      actualBackend: 'host',
      containerEnabled,
      fallbackCode,
      fallbackReason,
      capabilityAudit: createCapabilityAudit('host', containerEnabled, fallbackReason),
    };
  }

  const containerState = await getRunningContainerState(workspaceId, managers);
  if (containerState) {
    return {
      workspaceId,
      workspacePath,
      desiredRuntime: 'container',
      actualRuntime: 'container',
      desiredBackend,
      actualBackend: validatedBackend,
      containerEnabled,
      capabilityAudit: createCapabilityAudit('container', containerEnabled),
    };
  }

  fallbackReason = getContainerFallbackReason(workspaceId);
  return {
    workspaceId,
    workspacePath,
    desiredRuntime: 'container',
    actualRuntime: 'host',
    desiredBackend,
    actualBackend: 'host',
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
    getRuntimeConfig: workspaceManager.getRuntimeConfig.bind(workspaceManager),
    inspect: containerManager.inspect.bind(containerManager),
  });
}
