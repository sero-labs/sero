import type { WorkspaceRuntimeBackend } from '@/types/workspace-runtime';

export interface RuntimePlatformDefaultsInput {
  workspaceId?: string;
  platform?: NodeJS.Platform;
  arch?: string;
}

function isHostFirstEnabled(): boolean {
  return process.env.SERO_HOST_FIRST === '1';
}

function isSupportedHostDefault(platform: NodeJS.Platform, arch: string): boolean {
  if (platform === 'darwin') return arch === 'arm64' || arch === 'x64';
  if (platform === 'linux') return true;
  if (platform === 'win32') return arch === 'x64';
  return false;
}

export function getDefaultContainerRuntimeBackend(input: RuntimePlatformDefaultsInput = {}): WorkspaceRuntimeBackend {
  const platform = input.platform ?? process.platform;
  const arch = input.arch ?? process.arch;
  return platform === 'darwin' && arch === 'arm64' ? 'apple-container' : 'docker';
}

export function getDefaultRuntimeBackend(input: RuntimePlatformDefaultsInput = {}): WorkspaceRuntimeBackend {
  const platform = input.platform ?? process.platform;
  const arch = input.arch ?? process.arch;

  if (input.workspaceId === 'global' && isSupportedHostDefault(platform, arch)) return 'host';
  if (isHostFirstEnabled() && isSupportedHostDefault(platform, arch)) return 'host';
  return getDefaultContainerRuntimeBackend({ platform, arch });
}
