import type { WorkspaceConfig } from '@/types/ipc';
import type { WorkspaceRuntimeBackend, WorkspaceRuntimeBackendInput, WorkspaceRuntimeConfig } from '@/types/workspace-runtime';
import { getRuntimeCapabilities, UnsupportedRuntimeOnPlatformError } from './capabilities';
import { getDefaultRuntimeBackend, type RuntimePlatformDefaultsInput } from './platform-default';

export type WorkspaceRuntimeFallbackCode =
  | 'backend-unsupported-on-platform'
  | 'legacy-mac-host'
  | 'legacy-container-false';

export interface WorkspaceRuntimeBackendDetails {
  backend: WorkspaceRuntimeBackend;
  configuredBackend: WorkspaceRuntimeBackend;
  fallbackCode?: WorkspaceRuntimeFallbackCode;
  fallbackReason?: string;
}

export function isWorkspaceRuntimeBackend(value: unknown): value is WorkspaceRuntimeBackendInput {
  // Deprecated compatibility input; normalize to host on write.
  return value === 'apple-container' || value === 'docker' || value === 'host' || value === 'mac-host';
}

export function normalizeWorkspaceRuntimeBackend(backend: WorkspaceRuntimeBackendInput): WorkspaceRuntimeBackend {
  return backend === 'mac-host' ? 'host' : backend;
}

export function resolveWorkspaceRuntimeConfig(
  workspaceId: string,
  config: WorkspaceConfig | null | undefined,
  defaults: RuntimePlatformDefaultsInput = {},
): WorkspaceRuntimeConfig {
  const details = resolveWorkspaceRuntimeBackendDetails(workspaceId, config, defaults);
  if (details.fallbackReason) {
    console.warn(`[runtime] Workspace ${workspaceId}: ${details.fallbackReason}`);
  }
  return { ...(config?.runtime ?? {}), backend: details.backend };
}

export function resolveWorkspaceRuntimeBackendDetails(
  workspaceId: string,
  config: WorkspaceConfig | null | undefined,
  defaults: RuntimePlatformDefaultsInput = {},
): WorkspaceRuntimeBackendDetails {
  const platform = defaults.platform ?? process.platform;
  const arch = defaults.arch ?? process.arch;
  const platformDefaults = { ...defaults, platform, arch };
  const requested = readConfiguredBackend(workspaceId, config, platformDefaults);
  return validateBackendForPlatform(requested, platformDefaults);
}

export function normalizeWorkspaceConfigForWrite(
  config: WorkspaceConfig,
  defaults: RuntimePlatformDefaultsInput = {},
): WorkspaceConfig {
  const runtime = resolveWorkspaceRuntimeConfig(config.id, config, defaults);
  const normalized: WorkspaceConfig = { ...config, runtime };
  delete normalized.container;
  return normalized;
}

interface ConfiguredBackend {
  backend: WorkspaceRuntimeBackend;
  preFallbackCode?: WorkspaceRuntimeFallbackCode;
}

function readConfiguredBackend(
  workspaceId: string,
  config: WorkspaceConfig | null | undefined,
  defaults: Required<Pick<RuntimePlatformDefaultsInput, 'platform' | 'arch'>> & RuntimePlatformDefaultsInput,
): ConfiguredBackend {
  // Configs written before mac-host normalization still carry the deprecated alias on disk,
  // so widen the typed value to accept legacy input before the guard.
  const raw: unknown = config?.runtime?.backend;
  if (isWorkspaceRuntimeBackend(raw)) {
    const normalized = normalizeWorkspaceRuntimeBackend(raw);
    return raw === 'mac-host'
      ? { backend: normalized, preFallbackCode: 'legacy-mac-host' }
      : { backend: normalized };
  }
  if (config?.container === false) {
    return {
      backend: defaults.platform === 'win32' ? 'docker' : 'host',
      preFallbackCode: 'legacy-container-false',
    };
  }
  return { backend: getDefaultRuntimeBackend({ ...defaults, workspaceId }) };
}

function validateBackendForPlatform(
  configured: ConfiguredBackend,
  defaults: Required<Pick<RuntimePlatformDefaultsInput, 'platform' | 'arch'>> & RuntimePlatformDefaultsInput,
): WorkspaceRuntimeBackendDetails {
  try {
    getRuntimeCapabilities(configured.backend, defaults.platform);
    return configured.preFallbackCode
      ? { backend: configured.backend, configuredBackend: configured.backend, fallbackCode: configured.preFallbackCode }
      : { backend: configured.backend, configuredBackend: configured.backend };
  } catch (error) {
    if (!(error instanceof UnsupportedRuntimeOnPlatformError)) throw error;
    const fallback = getDefaultRuntimeBackend(defaults);
    // Guard against an unsupported platform default — re-evaluating capabilities ensures the fallback is usable.
    getRuntimeCapabilities(fallback, defaults.platform);
    return {
      backend: fallback,
      configuredBackend: configured.backend,
      fallbackCode: 'backend-unsupported-on-platform',
      fallbackReason: `${configured.backend} is not supported on ${defaults.platform}. Sero is falling back to ${fallback}.`,
    };
  }
}
