import type { WorkspaceConfig } from '@/types/ipc';
import type { WorkspaceRuntimeBackend, WorkspaceRuntimeConfig } from '@/types/workspace-runtime';
import { getDefaultRuntimeBackend, type RuntimePlatformDefaultsInput } from './platform-default';

export function isWorkspaceRuntimeBackend(value: unknown): value is WorkspaceRuntimeBackend {
  return value === 'apple-container' || value === 'docker' || value === 'mac-host';
}

export function resolveWorkspaceRuntimeConfig(
  workspaceId: string,
  config: WorkspaceConfig | null | undefined,
  defaults: RuntimePlatformDefaultsInput = {},
): WorkspaceRuntimeConfig {
  if (isWorkspaceRuntimeBackend(config?.runtime?.backend)) {
    return config.runtime;
  }

  if (config?.container === false && (defaults.platform ?? process.platform) === 'darwin') {
    return { backend: 'mac-host' };
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
