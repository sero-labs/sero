import type { WorkspaceRuntimeBackend } from '@/types/workspace-runtime';
import { isHostDefaultSupported } from './host-support-matrix';

export interface RuntimePlatformDefaultsInput {
  workspaceId?: string;
  platform?: NodeJS.Platform;
  arch?: string;
}

function isHostFirstEnabled(): boolean {
  return process.env.SERO_HOST_FIRST === '1';
}

export function getDefaultContainerRuntimeBackend(input: RuntimePlatformDefaultsInput = {}): WorkspaceRuntimeBackend {
  const platform = input.platform ?? process.platform;
  const arch = input.arch ?? process.arch;
  return platform === 'darwin' && arch === 'arm64' ? 'apple-container' : 'docker';
}

export function getDefaultRuntimeBackend(input: RuntimePlatformDefaultsInput = {}): WorkspaceRuntimeBackend {
  const platform = input.platform ?? process.platform;
  const arch = input.arch ?? process.arch;

  if (input.workspaceId === 'global' && isHostDefaultSupported(platform, arch)) return 'host';
  if (isHostFirstEnabled() && isHostDefaultSupported(platform, arch)) return 'host';
  return getDefaultContainerRuntimeBackend({ platform, arch });
}
