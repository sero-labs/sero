import { getOpenShellPolicyProfile } from '@sero-ai/common';
import type { ContainerManager, ContainerState } from '@electron/features/container';
import { containerManager } from '@electron/features/container/core/singleton';
import { workspaceManager, type WorkspaceManager } from './manager';
import type { WorkspaceRuntimeConfig, WorkspaceRuntimeProviderId } from '@/types/ipc';

export type WorkspaceRuntimeKind = 'container' | 'host' | 'openshell-local';
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
  providerId?: WorkspaceRuntimeProviderId;
  runtimeConfig?: WorkspaceRuntimeConfig;
  fallbackCode?: WorkspaceRuntimeFallbackCode;
  fallbackReason?: string;
  capabilityAudit: WorkspaceRuntimeCapabilityAuditEntry[];
}

type RuntimeResolutionManagers = Pick<WorkspaceManager, 'getPath' | 'isContainerEnabled'>
  & Partial<Pick<WorkspaceManager, 'getRuntimeConfig'>>
  & Pick<ContainerManager, 'inspect'>;

function getContainerFallbackReason(workspaceId: string, detail?: string): string {
  const suffix = detail ? ` ${detail}` : '';
  return `Container mode is enabled for workspace ${workspaceId}, but no running container is available. Sero is falling back to host mode until the container is ready again.${suffix}`;
}

function createOpenShellCapabilityAudit(
  runtimeConfig?: WorkspaceRuntimeConfig,
): WorkspaceRuntimeCapabilityAuditEntry[] {
  const profile = getOpenShellPolicyProfile(runtimeConfig?.policyProfileId);
  const prefix = `OpenShell Local is experimental and requires Docker plus the OpenShell CLI. Selected policy profile: ${profile.label}. Profiles are persisted Sero policy intent; current Sero OpenShell Local does not apply generated policy YAML.`;
  return [
    {
      key: 'browserAutomation',
      label: 'Browser automation',
      available: false,
      containerOnly: true,
      detail: `${prefix} Browser / computer-use tooling is not available for OpenShell Local yet.`,
    },
    {
      key: 'containerizedLanguageServers',
      label: 'Containerized language servers',
      available: false,
      containerOnly: true,
      detail: `${prefix} Containerized LSP remains unavailable until OpenShell language-server support is added.`,
    },
    {
      key: 'managedDevServers',
      label: 'Managed preview/dev servers',
      available: true,
      containerOnly: false,
      detail: `${prefix} Managed dev servers will use OpenShell sandbox execution and explicit port forwarding.`,
    },
    {
      key: 'containerMounts',
      label: 'Container mounts and references',
      available: false,
      containerOnly: true,
      detail: `${prefix} Apple container mounts and references are not inspected for OpenShell Local workspaces.`,
    },
  ];
}

function createCapabilityAudit(
  actualRuntime: WorkspaceRuntimeKind,
  containerEnabled: boolean,
  fallbackReason?: string,
  runtimeConfig?: WorkspaceRuntimeConfig,
): WorkspaceRuntimeCapabilityAuditEntry[] {
  if (actualRuntime === 'openshell-local') return createOpenShellCapabilityAudit(runtimeConfig);

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

async function resolveConfiguredProvider(
  workspaceId: string,
  managers: RuntimeResolutionManagers,
): Promise<{ providerId: WorkspaceRuntimeProviderId; runtimeConfig?: WorkspaceRuntimeConfig }> {
  const runtimeConfig = managers.getRuntimeConfig
    ? await managers.getRuntimeConfig(workspaceId)
    : undefined;
  if (runtimeConfig) return { providerId: runtimeConfig.providerId, runtimeConfig };

  const containerEnabled = await managers.isContainerEnabled(workspaceId);
  return { providerId: containerEnabled ? 'apple-container' : 'host' };
}

export async function resolveWorkspaceRuntimeWithManagers(
  workspaceId: string,
  managers: RuntimeResolutionManagers,
): Promise<WorkspaceRuntimeResolution> {
  const workspacePath = managers.getPath(workspaceId);
  if (!workspacePath) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  const { providerId, runtimeConfig } = await resolveConfiguredProvider(workspaceId, managers);
  if (providerId === 'host') {
    return {
      workspaceId,
      workspacePath,
      desiredRuntime: 'host',
      actualRuntime: 'host',
      containerEnabled: false,
      providerId,
      runtimeConfig,
      capabilityAudit: createCapabilityAudit('host', false),
    };
  }

  if (providerId === 'openshell-local') {
    return {
      workspaceId,
      workspacePath,
      desiredRuntime: 'openshell-local',
      actualRuntime: 'openshell-local',
      containerEnabled: false,
      providerId,
      runtimeConfig,
      capabilityAudit: createCapabilityAudit('openshell-local', false, undefined, runtimeConfig),
    };
  }

  const containerEnabled = true;
  const containerState = await getRunningContainerState(workspaceId, managers);
  if (containerState) {
    return {
      workspaceId,
      workspacePath,
      desiredRuntime: 'container',
      actualRuntime: 'container',
      containerEnabled,
      providerId,
      runtimeConfig,
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
    providerId,
    runtimeConfig,
    fallbackCode: 'container_unavailable',
    fallbackReason,
    capabilityAudit: createCapabilityAudit('host', containerEnabled, fallbackReason),
  };
}

export async function resolveWorkspaceRuntime(
  workspaceId: string,
): Promise<WorkspaceRuntimeResolution> {
  return resolveWorkspaceRuntimeWithManagers(workspaceId, {
    getPath: workspaceManager.getPath.bind(workspaceManager),
    isContainerEnabled: workspaceManager.isContainerEnabled.bind(workspaceManager),
    getRuntimeConfig: workspaceManager.getRuntimeConfig.bind(workspaceManager),
    inspect: containerManager.inspect.bind(containerManager),
  });
}
