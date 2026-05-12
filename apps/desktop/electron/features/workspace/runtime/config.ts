import type { WorkspaceConfig } from '@/types/ipc';
import type { WorkspaceRuntimeBackend, WorkspaceRuntimeBackendInput, WorkspaceRuntimeConfig } from '@/types/workspace-runtime';
import { getDefaultRuntimeBackend, type RuntimePlatformDefaultsInput } from './platform-default';

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
  const platform = defaults.platform ?? process.platform;
  const backend = config?.runtime?.backend;
  if (isWorkspaceRuntimeBackend(backend) && config?.runtime) {
    const normalized = normalizeWorkspaceRuntimeBackend(backend);
    if (normalized === 'host' && platform === 'win32') {
      console.warn(`[runtime] Workspace ${workspaceId} requested host runtime on Windows; falling back to docker.`);
      return { ...config.runtime, backend: 'docker' };
    }
    return { ...config.runtime, backend: normalized };
  }

  if (config?.container === false && platform === 'darwin') {
    return { backend: 'host' };
  }

  return {
    backend: getDefaultRuntimeBackend({ ...defaults, workspaceId }),
  };
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
