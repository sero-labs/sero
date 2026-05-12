import type { WorkspaceRuntimeBackend } from '@/types/workspace-runtime';

export interface RuntimePlatformDefaultsInput {
  workspaceId?: string;
  platform?: NodeJS.Platform;
  arch?: string;
}

export function getDefaultRuntimeBackend(input: RuntimePlatformDefaultsInput = {}): WorkspaceRuntimeBackend {
  const platform = input.platform ?? process.platform;
  const arch = input.arch ?? process.arch;

  if (input.workspaceId === 'global') return platform === 'win32' ? 'docker' : 'host';
  if (platform === 'darwin' && arch === 'arm64') return 'apple-container';
  return 'docker';
}
