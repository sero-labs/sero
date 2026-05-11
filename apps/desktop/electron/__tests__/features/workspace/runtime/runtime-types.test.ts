import { describe, expect, it, vi } from 'vitest';
import {
  getRuntimeCapabilities,
  RUNTIME_BACKEND_IDS,
  UnsupportedRuntimeOnPlatformError,
} from '@electron/features/workspace/runtime/capabilities';
import { RuntimeManager } from '@electron/features/workspace/runtime/runtime-manager';
import {
  RUNTIME_WORKSPACE_PATH,
  toHostWorkspacePath,
  toRuntimeWorkspacePath,
} from '@electron/features/workspace/runtime/runtime-paths';
import type { RuntimeBackendId, RuntimeDevServer } from '@electron/features/workspace/runtime/types';
import type { ContainerManager } from '@electron/features/container';
import type { WorkspaceManager } from '@electron/features/workspace/manager';

describe('runtime backend contract skeleton', () => {
  it('exposes the expected runtime backend ids', () => {
    expect(RUNTIME_BACKEND_IDS).toEqual(['apple-container', 'docker', 'host']);
  });

  it.each(RUNTIME_BACKEND_IDS)('defines complete capabilities for %s', (backend) => {
    const capabilities = getRuntimeCapabilities(backend, 'darwin');

    expect(capabilities).toMatchObject({
      exec: expect.any(Boolean),
      processes: {
        spawn: expect.any(Boolean),
        stdio: expect.any(Boolean),
        signal: expect.any(Boolean),
        longRunning: expect.any(Boolean),
      },
      files: {
        read: expect.any(Boolean),
        write: expect.any(Boolean),
        edit: expect.any(Boolean),
        list: expect.any(Boolean),
        mutateTree: expect.any(Boolean),
        watch: expect.any(Boolean),
      },
      vcs: {
        git: expect.any(Boolean),
        worktrees: expect.any(Boolean),
        pullRequests: expect.any(Boolean),
      },
      terminal: expect.any(Boolean),
      devServers: {
        start: expect.any(Boolean),
        stop: expect.any(Boolean),
        restart: expect.any(Boolean),
        status: expect.any(Boolean),
      },
      ports: {
        discover: expect.any(Boolean),
        forward: expect.any(Boolean),
        stopForward: expect.any(Boolean),
        previewUrl: expect.any(Boolean),
      },
      logs: expect.any(Boolean),
      browserAutomation: expect.any(Boolean),
      languageServers: expect.any(Boolean),
    });
  });

  it('keeps container backends capable of live-mounted workspace features', () => {
    expect(getRuntimeCapabilities('apple-container', 'darwin').browserAutomation).toBe(true);
    expect(getRuntimeCapabilities('docker', 'linux').browserAutomation).toBe(true);
    expect(getRuntimeCapabilities('apple-container', 'darwin').languageServers).toBe(true);
    expect(getRuntimeCapabilities('docker', 'linux').languageServers).toBe(true);
  });

  it('computes host capabilities per platform without browser automation', () => {
    const capabilities = getRuntimeCapabilities('host', 'darwin');

    expect(capabilities.browserAutomation).toBe(false);
    expect(capabilities.languageServers).toBe(true);
    expect(getRuntimeCapabilities('host', 'win32').languageServers).toBe(true);
  });

  it('rejects Apple Container capabilities on non-Darwin platforms', () => {
    expect(() => getRuntimeCapabilities('apple-container', 'linux')).toThrow(UnsupportedRuntimeOnPlatformError);
  });

  it('marks host as host access with managed dev-server preview capabilities', async () => {
    const manager = new RuntimeManager({
      workspaceManager: {
        getPath: vi.fn().mockReturnValue('/Users/daniel/project'),
        getRuntimeConfig: vi.fn().mockResolvedValue({ backend: 'host' }),
      } as unknown as WorkspaceManager,
      containerManager: {} as ContainerManager,
    });

    const runtime = await manager.getRuntime('workspace-a');

    expect(runtime.backend).toBe('host');
    expect(runtime.workspaceAccess).toBe('host');
    expect(runtime.runtimeWorkspacePath).toBe(RUNTIME_WORKSPACE_PATH);
    expect(runtime.capabilities.devServers.start).toBe(true);
    expect(runtime.capabilities.ports.previewUrl).toBe(true);
    expect(runtime.capabilities.browserAutomation).toBe(false);
  });

  it('resolves and caches one real backend per workspace/backend pair', async () => {
    const resolveBackend = vi.fn<(workspaceId: string) => RuntimeBackendId>().mockReturnValue('host');
    const manager = new RuntimeManager({
      workspaceManager: {
        getPath: vi.fn().mockReturnValue('/Users/daniel/project'),
        getRuntimeConfig: vi.fn().mockResolvedValue({ backend: 'host' }),
      } as unknown as WorkspaceManager,
      containerManager: {} as ContainerManager,
      resolveBackend,
    });

    const first = await manager.getRuntime('workspace-a');
    const second = await manager.getRuntime('workspace-a');
    const health = await manager.getHealth('workspace-a');

    expect(first).toBe(second);
    expect(first.backend).toBe('host');
    expect(first.workspaceAccess).toBe('host');
    expect(health).toMatchObject({ backend: 'host', status: 'ready' });
  });

  it('resolves Docker when selected', async () => {
    const manager = new RuntimeManager({
      workspaceManager: {
        getPath: vi.fn().mockReturnValue('/Users/daniel/project'),
        getRuntimeConfig: vi.fn().mockResolvedValue({ backend: 'docker' }),
      } as unknown as WorkspaceManager,
      containerManager: {} as ContainerManager,
    });

    const runtime = await manager.getRuntime('workspace-a');

    expect(runtime.backend).toBe('docker');
    expect(runtime.workspaceAccess).toBe('live-mount');
  });

  it('resets cached runtime state for a workspace', async () => {
    const manager = new RuntimeManager({
      workspaceManager: {
        getPath: vi.fn().mockReturnValue('/Users/daniel/project'),
        getRuntimeConfig: vi.fn().mockResolvedValue({ backend: 'host' }),
      } as unknown as WorkspaceManager,
      containerManager: {} as ContainerManager,
    });
    const runtime = await manager.getRuntime('workspace-a');
    const destroy = vi.spyOn(runtime, 'destroy');

    await manager.resetWorkspaceRuntime('workspace-a');
    const nextRuntime = await manager.getRuntime('workspace-a');

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(nextRuntime).not.toBe(runtime);
  });

  it('destroys a cached container runtime during reset', async () => {
    const manager = new RuntimeManager({
      workspaceManager: {
        getPath: vi.fn().mockReturnValue('/Users/daniel/project'),
        getRuntimeConfig: vi.fn().mockResolvedValue({ backend: 'docker' }),
      } as unknown as WorkspaceManager,
      containerManager: { getExtraEnvVars: vi.fn(() => ({})) } as unknown as ContainerManager,
    });
    const runtime = await manager.getRuntime('workspace-a');
    const destroy = vi.spyOn(runtime, 'destroy').mockResolvedValue(undefined);

    await manager.resetWorkspaceRuntime('workspace-a');
    const nextRuntime = await manager.getRuntime('workspace-a');

    expect(runtime.backend).toBe('docker');
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(nextRuntime).not.toBe(runtime);
  });

  it('creates the newly selected backend after reset', async () => {
    let backend: RuntimeBackendId = 'host';
    const manager = new RuntimeManager({
      workspaceManager: {
        getPath: vi.fn().mockReturnValue('/Users/daniel/project'),
        getRuntimeConfig: vi.fn().mockResolvedValue({ backend: 'host' }),
      } as unknown as WorkspaceManager,
      containerManager: { getExtraEnvVars: vi.fn(() => ({})) } as unknown as ContainerManager,
      resolveBackend: () => backend,
    });
    const hostRuntime = await manager.getRuntime('workspace-a');
    const hostDestroy = vi.spyOn(hostRuntime, 'destroy');

    await manager.resetWorkspaceRuntime('workspace-a');
    backend = 'docker';
    const dockerRuntime = await manager.getRuntime('workspace-a');

    expect(hostDestroy).toHaveBeenCalledTimes(1);
    expect(dockerRuntime).not.toBe(hostRuntime);
    expect(dockerRuntime.backend).toBe('docker');
  });

  it('merges runtime-backed dev servers without registering host servers in the legacy container registry', async () => {
    const legacyList = vi.fn(() => []);
    const manager = new RuntimeManager({
      workspaceManager: {
        getPath: vi.fn().mockReturnValue('/Users/daniel/project'),
        getRuntimeConfig: vi.fn().mockResolvedValue({ backend: 'host' }),
      } as unknown as WorkspaceManager,
      containerManager: { devServers: { list: legacyList } } as unknown as ContainerManager,
    });
    const runtime = await manager.getRuntime('workspace-a');
    const server: RuntimeDevServer = {
      id: 'workspace-a:workspace:root:5173',
      port: 5173,
      url: 'http://127.0.0.1:51000',
      command: 'pnpm dev',
      cwd: '/workspace',
    };
    runtime.listDevServersSync = vi.fn(() => [server]);

    expect(manager.listDevServersSync('workspace-a')).toEqual([server]);
    expect(legacyList).toHaveBeenCalledWith('workspace-a');
  });

  it('translates primary workspace paths between host and runtime roots', () => {
    expect(toRuntimeWorkspacePath('/Users/daniel/project', '/Users/daniel/project')).toBe('/workspace');
    expect(toRuntimeWorkspacePath('/Users/daniel/project', '/Users/daniel/project/src/App.tsx')).toBe('/workspace/src/App.tsx');
    expect(toRuntimeWorkspacePath('/Users/daniel/project', '/Users/daniel/other')).toBeNull();
    expect(toHostWorkspacePath('/Users/daniel/project', '/workspace/src/App.tsx')).toBe('/Users/daniel/project/src/App.tsx');
  });
});
