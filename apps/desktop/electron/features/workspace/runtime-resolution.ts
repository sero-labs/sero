import type {
  RuntimeBackendId,
  RuntimeBrowserAutomationInstallState,
  RuntimeCapabilities,
  RuntimeCapabilityInstallState,
  RuntimeCapabilityState,
  RuntimeHealth,
  RuntimeNativeBuildToolsInstallState,
} from './runtime/types';
import { getRuntimeCapabilities } from './runtime/capabilities';
import type { WorkspaceRuntimeBackendDetails } from './runtime/config';
import { workspaceManager } from './manager';
import { runtimeManager } from './runtime/runtime-manager';
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
  support: boolean;
  available: boolean;
  containerOnly: boolean;
  installState?: string;
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

const CAPABILITY_CONTAINER_ONLY: Record<WorkspaceRuntimeCapabilityKey, boolean> = {
  browserAutomation: false,
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
  capabilityState: RuntimeCapabilityState;
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
  return `Container runtime is selected for workspace ${workspaceId}, but it is not available. Sero will not fall back to host execution; fix the runtime and try again.${suffix}`;
}

function createCapabilityState(
  actualBackend: RuntimeBackendId,
  actualRuntime: WorkspaceRuntimeKind,
  health?: RuntimeHealth,
): RuntimeCapabilityState {
  const support = getRuntimeCapabilities(actualBackend, process.platform, process.arch);
  const installState = createInstallState(actualBackend, actualRuntime, health);
  return {
    support,
    available: createAvailableCapabilities(support, actualRuntime, installState, health),
    installState,
  };
}

function createInstallState(
  actualBackend: RuntimeBackendId,
  actualRuntime: WorkspaceRuntimeKind,
  health?: RuntimeHealth,
): RuntimeCapabilityInstallState {
  if (actualRuntime === 'container') {
    const ready = health?.status === 'ready';
    return {
      coreTools: ready ? 'ready' : 'failed',
      browserAutomation: ready && actualBackend !== 'host' ? 'ready' : 'failed',
      nativeBuildTools: ready ? 'available' : 'unknown',
    };
  }

  return {
    coreTools: hostCoreToolsInstallState(health),
    browserAutomation: hostBrowserAutomationInstallState(health),
    nativeBuildTools: hostNativeBuildToolsInstallState(health),
  };
}

function hostCoreToolsInstallState(health?: RuntimeHealth): RuntimeCapabilityInstallState['coreTools'] {
  const check = health?.checks?.find((result) => result.id === 'runtime.host.core-tools');
  const state = stringDetail(check?.details, 'installState');
  if (state === 'ready' || state === 'installing' || state === 'missing' || state === 'failed') return state;
  if (state === 'incompatible' || state === 'installable') return 'missing';
  if (check?.status === 'pass') return 'ready';
  if (check?.status === 'fail') return 'failed';
  return health?.status === 'ready' ? 'ready' : 'missing';
}

function hostBrowserAutomationInstallState(health?: RuntimeHealth): RuntimeBrowserAutomationInstallState {
  const check = health?.checks?.find((result) => result.id === 'runtime.host.browser');
  const state = stringDetail(check?.details, 'installState');
  if (state === 'ready' || state === 'installable' || state === 'installing' || state === 'missing' || state === 'failed') return state;
  if (check?.status === 'pass') return 'ready';
  if (check?.status === 'fail') return 'failed';
  return 'installable';
}

function hostNativeBuildToolsInstallState(health?: RuntimeHealth): RuntimeNativeBuildToolsInstallState {
  const check = health?.checks?.find((result) => result.id === 'runtime.host.native-build-tools');
  const state = stringDetail(check?.details, 'installState');
  if (state === 'available' || state === 'missing' || state === 'unknown') return state;
  if (state === 'ready') return 'available';
  if (check?.status === 'pass') return 'available';
  return 'unknown';
}

function stringDetail(details: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = details?.[key];
  return typeof value === 'string' ? value : undefined;
}

function createAvailableCapabilities(
  support: RuntimeCapabilities,
  actualRuntime: WorkspaceRuntimeKind,
  installState: RuntimeCapabilityInstallState,
  health?: RuntimeHealth,
): RuntimeCapabilities {
  const healthReady = health?.status !== undefined ? health.status === 'ready' : true;
  const available = cloneCapabilities(support);
  if (!healthReady || installState.coreTools !== 'ready') {
    available.exec = false;
    available.processes = { spawn: false, stdio: false, signal: false, longRunning: false };
    available.vcs = { git: false, worktrees: false, pullRequests: false };
    available.terminal = false;
    available.devServers = { start: false, stop: false, restart: false, status: false };
    available.ports = { discover: false, forward: false, stopForward: false, previewUrl: false };
    available.languageServers = false;
  }
  available.browserAutomation = actualRuntime === 'container'
    ? healthReady && support.browserAutomation
    : installState.browserAutomation === 'ready';
  return available;
}

function cloneCapabilities(capabilities: RuntimeCapabilities): RuntimeCapabilities {
  return {
    ...capabilities,
    processes: { ...capabilities.processes },
    files: { ...capabilities.files },
    vcs: { ...capabilities.vcs },
    devServers: { ...capabilities.devServers },
    ports: { ...capabilities.ports },
  };
}

function createCapabilityAudit(
  actualBackend: RuntimeBackendId,
  actualRuntime: WorkspaceRuntimeKind,
  capabilityState: RuntimeCapabilityState,
  containerEnabled: boolean,
  fallbackReason?: string,
): WorkspaceRuntimeCapabilityAuditEntry[] {
  const hostModeReason = containerEnabled
    ? fallbackReason ?? 'Container mode is preferred, but this workspace is currently running on the host.'
    : 'Workspace is explicitly set to host mode.';

  return CAPABILITY_KEYS.map((key) => buildAuditEntry({
    key,
    capabilityState,
    actualBackend,
    actualRuntime,
    hostModeReason,
  }));
}

interface BuildAuditEntryInput {
  key: WorkspaceRuntimeCapabilityKey;
  capabilityState: RuntimeCapabilityState;
  actualBackend: RuntimeBackendId;
  actualRuntime: WorkspaceRuntimeKind;
  hostModeReason: string;
}

function buildAuditEntry(input: BuildAuditEntryInput): WorkspaceRuntimeCapabilityAuditEntry {
  const support = isCapabilitySupported(input.key, input.capabilityState.support, input.actualRuntime);
  const available = isCapabilityAvailable(input.key, input.capabilityState.available, input.actualRuntime);
  return {
    key: input.key,
    label: CAPABILITY_LABELS[input.key],
    support,
    available,
    containerOnly: CAPABILITY_CONTAINER_ONLY[input.key],
    installState: capabilityInstallState(input.key, input.capabilityState.installState),
    detail: capabilityDetail(input.key, {
      available,
      support,
      actualBackend: input.actualBackend,
      actualRuntime: input.actualRuntime,
      hostModeReason: input.hostModeReason,
      installState: input.capabilityState.installState,
    }),
  };
}

function createUnavailableContainerCapabilityAudit(
  actualBackend: RuntimeBackendId,
  fallbackReason: string,
  capabilityState: RuntimeCapabilityState,
): WorkspaceRuntimeCapabilityAuditEntry[] {
  return CAPABILITY_KEYS.map((key) => ({
    key,
    label: CAPABILITY_LABELS[key],
    support: isCapabilitySupported(key, capabilityState.support, 'container'),
    available: false,
    containerOnly: CAPABILITY_CONTAINER_ONLY[key],
    installState: capabilityInstallState(key, capabilityState.installState),
    detail: `${runtimeName(actualBackend)} runtime is unavailable. ${fallbackReason}`,
  }));
}

function capabilityInstallState(
  key: WorkspaceRuntimeCapabilityKey,
  installState: RuntimeCapabilityInstallState,
): string | undefined {
  if (key === 'browserAutomation') return installState.browserAutomation;
  if (key === 'containerizedLanguageServers' || key === 'managedDevServers') return installState.coreTools;
  return undefined;
}

function isCapabilitySupported(
  key: WorkspaceRuntimeCapabilityKey,
  capabilities: RuntimeCapabilities,
  actualRuntime: WorkspaceRuntimeKind,
): boolean {
  switch (key) {
    case 'browserAutomation':
      return capabilities.browserAutomation;
    case 'containerizedLanguageServers':
      return capabilities.languageServers;
    case 'managedDevServers':
      return capabilities.devServers.start && capabilities.devServers.stop;
    case 'containerMounts':
      return actualRuntime === 'container';
  }
}

function isCapabilityAvailable(
  key: WorkspaceRuntimeCapabilityKey,
  capabilities: RuntimeCapabilities,
  actualRuntime: WorkspaceRuntimeKind,
): boolean {
  switch (key) {
    case 'browserAutomation':
      return capabilities.browserAutomation;
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
  support: boolean;
  actualBackend: RuntimeBackendId;
  actualRuntime: WorkspaceRuntimeKind;
  hostModeReason: string;
  installState: RuntimeCapabilityInstallState;
}

function capabilityDetail(
  key: WorkspaceRuntimeCapabilityKey,
  input: CapabilityDetailInput,
): string {
  switch (key) {
    case 'browserAutomation':
      return browserAutomationDetail(input);
    case 'containerizedLanguageServers':
      return input.actualRuntime === 'container'
        ? 'Language servers run inside the workspace container.'
        : coreToolsDetail('Language servers run on the host runtime', input.installState.coreTools);
    case 'managedDevServers':
      return input.actualRuntime === 'container'
        ? 'Managed preview and dev-server automation targets the workspace container.'
        : coreToolsDetail('Managed preview and dev-server automation runs on the host runtime', input.installState.coreTools);
    case 'containerMounts':
      return input.available
        ? 'Workspace references and folder mounts apply immediately to the active container runtime.'
        : `${input.hostModeReason} Workspace references and mounts only take effect once the workspace is running in a container again.`;
  }
}

function browserAutomationDetail(input: CapabilityDetailInput): string {
  if (input.actualRuntime === 'container') {
    return input.available
      ? 'Browser / computer-use tooling is available because this container runtime includes the browser pack.'
      : 'Browser / computer-use tooling is supported by this container runtime, but the runtime is not available right now.';
  }
  if (input.installState.browserAutomation === 'ready') return 'Host browser automation pack is installed and ready.';
  if (input.installState.browserAutomation === 'installing') return 'Host browser automation pack is installing.';
  if (input.installState.browserAutomation === 'failed') return 'Host browser automation pack is installed or installable, but the latest Doctor check failed.';
  if (input.installState.browserAutomation === 'missing') return `${input.hostModeReason} Host browser automation pack is unavailable for this machine right now.`;
  return `${input.hostModeReason} Host browser automation is installable as a large add-on.`;
}

function coreToolsDetail(prefix: string, state: RuntimeCapabilityInstallState['coreTools']): string {
  if (state === 'ready') return `${prefix}.`;
  if (state === 'installing') return `${prefix} after managed core tools finish installing.`;
  if (state === 'failed') return `${prefix} after managed core tool installation or verification is repaired.`;
  return `${prefix} after missing managed core tools are installed.`;
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

  const usesContainerRuntime = validatedBackend !== 'host';
  if (!usesContainerRuntime) {
    const health = await managers.getRuntimeHealth(workspaceId);
    const capabilityState = createCapabilityState('host', 'host', health);
    return {
      workspaceId,
      workspacePath,
      desiredRuntime: desiredBackend === 'host' ? 'host' : 'container',
      actualRuntime: 'host',
      desiredBackend,
      actualBackend: 'host',
      containerEnabled: usesContainerRuntime,
      fallbackCode: platformFallback,
      fallbackReason: details.fallbackReason,
      capabilityState,
      capabilityAudit: createCapabilityAudit('host', 'host', capabilityState, usesContainerRuntime, details.fallbackReason),
    };
  }

  const health = await managers.getRuntimeHealth(workspaceId);
  const readyCapabilityState = createCapabilityState(validatedBackend, 'container', health);
  if (health.status === 'ready') {
    return {
      workspaceId,
      workspacePath,
      desiredRuntime: 'container',
      actualRuntime: 'container',
      desiredBackend,
      actualBackend: validatedBackend,
      containerEnabled: usesContainerRuntime,
      fallbackCode: platformFallback,
      fallbackReason: details.fallbackReason,
      capabilityState: readyCapabilityState,
      capabilityAudit: createCapabilityAudit(validatedBackend, 'container', readyCapabilityState, usesContainerRuntime, details.fallbackReason),
    };
  }

  const containerFallbackReason = getContainerFallbackReason(workspaceId, getHealthDetail(health));
  return {
    workspaceId,
    workspacePath,
    desiredRuntime: 'container',
    actualRuntime: 'container',
    desiredBackend,
    actualBackend: validatedBackend,
    containerEnabled: usesContainerRuntime,
    fallbackCode: 'container_unavailable',
    fallbackReason: containerFallbackReason,
    capabilityState: readyCapabilityState,
    capabilityAudit: createUnavailableContainerCapabilityAudit(validatedBackend, containerFallbackReason, readyCapabilityState),
  };
}

function runtimeName(backend: RuntimeBackendId): string {
  if (backend === 'apple-container') return 'Apple Container';
  if (backend === 'docker') return 'Docker';
  return 'Host';
}

function toPlatformFallbackCode(details: WorkspaceRuntimeBackendDetails): WorkspaceRuntimeFallbackCode | undefined {
  return details.fallbackCode === 'backend-unsupported-on-platform'
    ? 'backend-unsupported-on-platform'
    : undefined;
}

export function resolveWorkspaceRuntime(
  workspaceId: string,
): Promise<WorkspaceRuntimeResolution> {
  return resolveWorkspaceRuntimeWithManagers(workspaceId, {
    getPath: workspaceManager.getPath.bind(workspaceManager),
    getRuntimeBackendDetails: workspaceManager.getRuntimeBackendDetails.bind(workspaceManager),
    getRuntimeHealth: runtimeManager.getHealth.bind(runtimeManager),
  });
}
