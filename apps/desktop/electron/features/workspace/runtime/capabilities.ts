import type { RuntimeBackendId, RuntimeCapabilities } from './types';

function createFullCapabilities(): RuntimeCapabilities {
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
    browserAutomation: true,
    languageServers: true,
  };
}

function createHostCapabilities(): RuntimeCapabilities {
  return {
    ...createFullCapabilities(),
    devServers: {
      start: false,
      stop: false,
      restart: false,
      status: false,
    },
    ports: {
      discover: false,
      forward: false,
      stopForward: false,
      previewUrl: false,
    },
    browserAutomation: false,
    languageServers: false,
  };
}

export const RUNTIME_BACKEND_IDS = ['apple-container', 'docker', 'host'] as const satisfies readonly RuntimeBackendId[];

export const RUNTIME_CAPABILITIES = {
  'apple-container': createFullCapabilities(),
  docker: createFullCapabilities(),
  host: createHostCapabilities(),
} as const satisfies Record<RuntimeBackendId, RuntimeCapabilities>;

export function getRuntimeCapabilities(backend: RuntimeBackendId): RuntimeCapabilities {
  return RUNTIME_CAPABILITIES[backend];
}
