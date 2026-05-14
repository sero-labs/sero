import type { RuntimeBackendId, RuntimeCapabilities, RuntimeHealth } from './runtime/types';
import { getRuntimeCapabilities } from './runtime/capabilities';
import type { WorkspaceRuntimeBackendDetails } from './runtime/config';
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

const CAPABILITY_KEYS: readonly WorkspaceRuntimeCapabilityKey[] = [
  'browserAutomation',
  'containerizedLanguageServers',
  'managedDevServers',
  'containerMounts',
];

const CAPABILITY_LABELS: Record<WorkspaceRuntimeCapabilityKey, string> = {
  browserAutomation: 'Browser automation',
  containerizedLanguageServers: 'Language servers',
  managedDevServers: 'Managed preview/dev servers',
  containerMounts: 'Container mounts and references',
};

// Whether a capability requires a container runtime. Browser automation and
// container mounts are container-exclusive; language servers and managed
// dev servers also run on the host runtime since the cross-platform-host
// workstream landed.
const CAPABILITY_CONTAINER_ONLY: Record<WorkspaceRuntimeCapabilityKey, boolean> = {
  browserAutomation: true,
  containerizedLanguageServers: false,
  managedDevServers: false,
  containerMounts: true,
};

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

type RuntimeResolutionManagers = Pick<WorkspaceManager, 'getPath' | 'getRuntimeBackendDetails'> & {
  getRuntimeHealth(workspaceId: string): Promise<RuntimeHealth>;
};

function getHealthDetail(health: RuntimeHealth): string | undefined {
  return [health.message, health.detail].filter(Boolean).join(' ') || undefined;
}

function getContainerFallbackReason(workspaceId: string, detail?: string): string {
  const suffix = detail ? ` ${detail}` : '';
  return `Container mode is enabled for workspace ${workspaceId}, but no running container is available. Sero is falling back to host mode until the container is ready again.${suffix}`;
}

function createCapabilityAudit(
  actualBackend: RuntimeBackendId,
  actualRuntime: WorkspaceRuntimeKind,
  containerEnabled: boolean,
  fallbackReason?: string,
): WorkspaceRuntimeCapabilityAuditEntry[] {
  const capabilities = getRuntimeCapabilities(actualBackend, process.platform);
  const hostModeReason = containerEnabled
    ? fallbackReason ?? 'Container mode is preferred, but this workspace is currently running on the host.'
    : 'Workspace is explicitly set to host mode.';

  return CAPABILITY_KEYS.map((key) => buildAuditEntry({
    key,
    capabilities,
    actualBackend,
    actualRuntime,
    hostModeReason,
  }));
}

interface BuildAuditEntryInput {
  key: WorkspaceRuntimeCapabilityKey;
  capabilities: RuntimeCapabilities;
  actualBackend: RuntimeBackendId;
  actualRuntime: WorkspaceRuntimeKind;
  hostModeReason: string;
}

function buildAuditEntry(input: BuildAuditEntryInput): WorkspaceRuntimeCapabilityAuditEntry {
  const containerOnly = CAPABILITY_CONTAINER_ONLY[input.key];
  const available = isCapabilityAvailable(input.key, input.capabilities, input.actualRuntime);
  return {
    key: input.key,
    label: CAPABILITY_LABELS[input.key],
    available,
    containerOnly,
    detail: capabilityDetail(input.key, {
      available,
      containerOnly,
      actualBackend: input.actualBackend,
      actualRuntime: input.actualRuntime,
      hostModeReason: input.hostModeReason,
    }),
  };
}

function isCapabilityAvailable(
  key: WorkspaceRuntimeCapabilityKey,
  capabilities: RuntimeCapabilities,
  actualRuntime: WorkspaceRuntimeKind,
): boolean {
  switch (key) {
    case 'browserAutomation':
      return actualRuntime === 'container' && capabilities.browserAutomation;
    case 'containerizedLanguageServers':
      return capabilities.languageServers;
    case 'managedDevServers':
      return capabilities.devServers.start && capabilities.devServers.stop;
    case 'containerMounts':
      return actualRuntime === 'container';
  }
}

interface CapabilityDetailInput {
  available: boolean;
  containerOnly: boolean;
  actualBackend: RuntimeBackendId;
  actualRuntime: WorkspaceRuntimeKind;
  hostModeReason: string;
}

function capabilityDetail(
  key: WorkspaceRuntimeCapabilityKey,
  input: CapabilityDetailInput,
): string {
  switch (key) {
    case 'browserAutomation':
      return input.available
        ? 'Browser / computer-use tooling is available because this workspace is running in a container.'
        : `${input.hostModeReason} Browser / computer-use tooling remains container-only.`;
    case 'containerizedLanguageServers':
      return input.actualRuntime === 'container'
        ? 'Language servers run inside the workspace container.'
        : 'Language servers run on the host runtime.';
    case 'managedDevServers':
      return input.actualRuntime === 'container'
        ? 'Managed preview and dev-server automation targets the workspace container.'
        : 'Managed preview and dev-server automation runs on the host runtime.';
    case 'containerMounts':
      return input.available
        ? 'Workspace references and folder mounts apply immediately to the active container runtime.'
        : `${input.hostModeReason} Workspace references and mounts only take effect once the workspace is running in a container again.`;
  }
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

export async function resolveWorkspaceRuntimeWithManagers(
  workspaceId: string,
  managers: RuntimeResolutionManagers,
): Promise<WorkspaceRuntimeResolution> {
  const workspacePath = managers.getPath(workspaceId);
  if (!workspacePath) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  const details = await managers.getRuntimeBackendDetails(workspaceId);
  const platformFallback = toPlatformFallbackCode(details);
  const validatedBackend = details.backend;
  const desiredBackend = details.configuredBackend;

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
      fallbackCode: platformFallback,
      fallbackReason: details.fallbackReason,
      capabilityAudit: createCapabilityAudit('host', 'host', containerEnabled, details.fallbackReason),
    };
  }

  const health = await managers.getRuntimeHealth(workspaceId);
  if (health.status === 'ready') {
    return {
      workspaceId,
      workspacePath,
      desiredRuntime: 'container',
      actualRuntime: 'container',
      desiredBackend,
      actualBackend: validatedBackend,
      containerEnabled,
      fallbackCode: platformFallback,
      fallbackReason: details.fallbackReason,
      capabilityAudit: createCapabilityAudit(validatedBackend, 'container', containerEnabled, details.fallbackReason),
    };
  }

  const containerFallbackReason = getContainerFallbackReason(workspaceId, getHealthDetail(health));
  return {
    workspaceId,
    workspacePath,
    desiredRuntime: 'container',
    actualRuntime: 'host',
    desiredBackend,
    actualBackend: validatedBackend,
    containerEnabled,
    fallbackCode: 'container_unavailable',
    fallbackReason: containerFallbackReason,
    capabilityAudit: createCapabilityAudit(validatedBackend, 'host', containerEnabled, containerFallbackReason),
  };
}

function toPlatformFallbackCode(details: WorkspaceRuntimeBackendDetails): WorkspaceRuntimeFallbackCode | undefined {
  return details.fallbackCode === 'backend-unsupported-on-platform'
    ? 'backend-unsupported-on-platform'
    : undefined;
}

export async function resolveWorkspaceRuntime(
  workspaceId: string,
): Promise<WorkspaceRuntimeResolution> {
  const [{ workspaceManager }, { runtimeManager }] = await Promise.all([
    import('@electron/features/workspace/manager'),
    import('@electron/features/workspace/runtime/runtime-manager'),
  ]);

  return resolveWorkspaceRuntimeWithManagers(workspaceId, {
    getPath: workspaceManager.getPath.bind(workspaceManager),
    getRuntimeBackendDetails: workspaceManager.getRuntimeBackendDetails.bind(workspaceManager),
    getRuntimeHealth: runtimeManager.getHealth.bind(runtimeManager),
  });
}
