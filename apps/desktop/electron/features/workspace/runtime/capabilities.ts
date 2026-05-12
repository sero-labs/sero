import type { RuntimeBackendId, RuntimeCapabilities } from './types';

function createBaseCapabilities(): RuntimeCapabilities {
  return {
    exec: true,
    processes: {
      spawn: true,
      stdio: true,
      signal: true,
      longRunning: true,
    },
    files: {
      read: true,
      write: true,
      edit: true,
      list: true,
      mutateTree: true,
      watch: true,
    },
    vcs: {
      git: true,
      worktrees: true,
      pullRequests: true,
    },
    terminal: true,
    devServers: {
      start: true,
      stop: true,
      restart: true,
      status: true,
    },
    ports: {
      discover: true,
      forward: true,
      stopForward: true,
      previewUrl: true,
    },
    logs: true,
    browserAutomation: false,
    languageServers: true,
  };
}

function createHostCapabilities(_platform: NodeJS.Platform): RuntimeCapabilities {
  return {
    ...createBaseCapabilities(),
    ports: {
      discover: true,
      forward: false,
      stopForward: false,
      previewUrl: true,
    },
  };
}

function createDockerCapabilities(): RuntimeCapabilities {
  const base = createBaseCapabilities();
  return {
    ...base,
    files: {
      ...base.files,
      watch: false,
    },
    browserAutomation: true,
  };
}

function createAppleContainerCapabilities(): RuntimeCapabilities {
  const base = createBaseCapabilities();
  return {
    ...base,
    files: {
      ...base.files,
      watch: false,
    },
    browserAutomation: true,
  };
}

export class UnsupportedRuntimeOnPlatformError extends Error {
  constructor(readonly backend: RuntimeBackendId, readonly platform: NodeJS.Platform) {
    super(`${backend} is not supported on ${platform}`);
    this.name = 'UnsupportedRuntimeOnPlatformError';
  }
}

export const RUNTIME_BACKEND_IDS = ['apple-container', 'docker', 'host'] as const satisfies readonly RuntimeBackendId[];

export function getRuntimeCapabilities(
  backend: RuntimeBackendId,
  platform: NodeJS.Platform = process.platform,
): RuntimeCapabilities {
  if (backend === 'apple-container' && platform !== 'darwin') {
    throw new UnsupportedRuntimeOnPlatformError(backend, platform);
  }
  if (backend === 'host' && platform === 'win32') {
    throw new UnsupportedRuntimeOnPlatformError(backend, platform);
  }
  if (backend === 'host') return createHostCapabilities(platform);
  if (backend === 'docker') return createDockerCapabilities();
  return createAppleContainerCapabilities();
}
