import { describe, expect, it, vi } from 'vitest';
import {
  getRuntimeCapabilities,
  RUNTIME_BACKEND_IDS,
  UnsupportedRuntimeOnPlatformError,
} from '@electron/features/workspace/runtime/capabilities';
import { RuntimeManager } from '@electron/features/workspace/runtime/runtime-manager';
import { HostBackend } from '@electron/features/workspace/runtime/backends/host/host-backend';
import {
  RUNTIME_WORKSPACE_PATH,
  toHostWorkspacePath,
  toRuntimeWorkspacePath,
} from '@electron/features/workspace/runtime/runtime-paths';
import type { RuntimeBackendId, RuntimeDevServer, RuntimeDevServerChangeEvent } from '@electron/features/workspace/runtime/types';
import type { ContainerManager } from '@electron/features/container';
import type { WorkspaceManager } from '@electron/features/workspace/manager';

describe('runtime backend contract skeleton', () => {
  it('exposes the expected runtime backend ids', () => {
    expect(RUNTIME_BACKEND_IDS).toEqual(['apple-container', 'docker', 'host']);
  });

  it.each(RUNTIME_BACKEND_IDS)('defines complete capabilities for %s', (backend) => {
    const capabilities = getRuntimeCapabilities(backend, 'darwin', 'arm64');

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

  it('keeps container backend capabilities aligned with implemented behavior', () => {
    const appleCapabilities = getRuntimeCapabilities('apple-container', 'darwin', 'arm64');
    const dockerCapabilities = getRuntimeCapabilities('docker', 'linux');

    expect(appleCapabilities.browserAutomation).toBe(true);
    expect(dockerCapabilities.browserAutomation).toBe(true);
    expect(appleCapabilities.languageServers).toBe(true);
    expect(dockerCapabilities.languageServers).toBe(true);
    expect(appleCapabilities.files.watch).toBe(false);
    expect(dockerCapabilities.files.watch).toBe(false);
  });

  it('computes host capabilities per platform with installable browser automation support', () => {
    const capabilities = getRuntimeCapabilities('host', 'darwin');

    expect(capabilities.browserAutomation).toBe(true);
    expect(capabilities.files.watch).toBe(false);
    expect(capabilities.languageServers).toBe(true);
    expect(getRuntimeCapabilities('host', 'linux').languageServers).toBe(true);
    expect(getRuntimeCapabilities('host', 'win32').languageServers).toBe(true);
  });

  it('rejects Apple Container capabilities outside macOS Apple Silicon', () => {
    expect(() => getRuntimeCapabilities('apple-container', 'linux', 'arm64')).toThrow(UnsupportedRuntimeOnPlatformError);
    expect(() => getRuntimeCapabilities('apple-container', 'darwin', 'x64')).toThrow(UnsupportedRuntimeOnPlatformError);
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
    expect(runtime.capabilities.browserAutomation).toBe(true);
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

  it('clears cached runtime entries even when destroy fails', async () => {
    const manager = new RuntimeManager({
      workspaceManager: {
        getPath: vi.fn().mockReturnValue('/Users/daniel/project'),
        getRuntimeConfig: vi.fn().mockResolvedValue({ backend: 'host' }),
      } as unknown as WorkspaceManager,
      containerManager: {} as ContainerManager,
    });
    const runtime = await manager.getRuntime('workspace-a');
    vi.spyOn(runtime, 'destroy').mockRejectedValueOnce(new Error('destroy failed'));

    await expect(manager.resetWorkspaceRuntime('workspace-a')).rejects.toThrow('destroy failed');
    const nextRuntime = await manager.getRuntime('workspace-a');

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

  it('re-emits backend dev-server events and unsubscribes on reset', async () => {
    const backendCallbacks: Array<(event: RuntimeDevServerChangeEvent) => void> = [];
    const unsubscribe = vi.fn();
    const onDevServerChange = vi.spyOn(HostBackend.prototype, 'onDevServerChange')
      .mockImplementation((cb) => {
        backendCallbacks.push(cb);
        return unsubscribe;
      });
    const manager = new RuntimeManager({
      workspaceManager: {
        getPath: vi.fn().mockReturnValue('/Users/daniel/project'),
        getRuntimeConfig: vi.fn().mockResolvedValue({ backend: 'host' }),
      } as unknown as WorkspaceManager,
      containerManager: {} as ContainerManager,
    });
    const events: unknown[] = [];
    manager.onDevServerChange((event) => events.push(event));

    await manager.getRuntime('workspace-a');
    backendCallbacks[0]?.({
      type: 'registered',
      workspaceId: 'workspace-a',
      serverId: 'workspace-a:workspace:root:5173',
      status: 'running',
    });
    await manager.resetWorkspaceRuntime('workspace-a');

    expect(events).toEqual([
      expect.objectContaining({ type: 'registered', workspaceId: 'workspace-a', status: 'running' }),
    ]);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    onDevServerChange.mockRestore();
  });

  it('continues to forward legacy container dev-server events', () => {
    let legacyCallback: ((event: { type: 'registered'; server: RuntimeDevServer & { workspaceId: string } }) => void) | undefined;
    const manager = new RuntimeManager({
      workspaceManager: {} as WorkspaceManager,
      containerManager: {
        devServers: {
          onChange: vi.fn((cb) => {
            legacyCallback = cb;
            return vi.fn();
          }),
        },
      } as unknown as ContainerManager,
    });
    const events: unknown[] = [];

    manager.onDevServerChange((event) => events.push(event));
    legacyCallback?.({
      type: 'registered',
      server: {
        id: 'workspace-a:workspace:root:5173',
        workspaceId: 'workspace-a',
        port: 5173,
        url: 'http://127.0.0.1:5173',
        command: 'pnpm dev',
        cwd: '/workspace',
      },
    });

    expect(events).toEqual([
      expect.objectContaining({ type: 'registered', workspaceId: 'workspace-a', serverId: 'workspace-a:workspace:root:5173' }),
    ]);
  });

  it('shares one legacy dev-server listener across runtime manager subscribers', () => {
    let legacyCallback: ((event: { type: 'registered'; server: RuntimeDevServer & { workspaceId: string } }) => void) | undefined;
    const legacyUnsubscribe = vi.fn();
    const onChange = vi.fn((cb) => {
      legacyCallback = cb;
      return legacyUnsubscribe;
    });
    const manager = new RuntimeManager({
      workspaceManager: {} as WorkspaceManager,
      containerManager: { devServers: { onChange } } as unknown as ContainerManager,
    });
    const first = vi.fn();
    const second = vi.fn();

    const unsubscribeFirst = manager.onDevServerChange(first);
    const unsubscribeSecond = manager.onDevServerChange(second);
    legacyCallback?.({
      type: 'registered',
      server: {
        id: 'workspace-a:workspace:root:5173',
        workspaceId: 'workspace-a',
        port: 5173,
        url: 'http://127.0.0.1:5173',
        command: 'pnpm dev',
        cwd: '/workspace',
      },
    });
    unsubscribeFirst();
    expect(legacyUnsubscribe).not.toHaveBeenCalled();
    unsubscribeSecond();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(legacyUnsubscribe).toHaveBeenCalledTimes(1);
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

  it('purges stale legacy dev servers when a host runtime is active', async () => {
    let legacyServers = [{
      id: 'workspace-a:workspace:root:7000',
      workspaceId: 'workspace-a',
      port: 7000,
      url: 'http://127.0.0.1:7000',
      command: 'npm run dev',
      cwd: '/workspace',
      status: 'running' as const,
    }];
    const legacyList = vi.fn((workspaceId?: string) => (
      workspaceId ? legacyServers.filter((server) => server.workspaceId === workspaceId) : legacyServers
    ));
    const unregister = vi.fn((serverId: string) => {
      const exists = legacyServers.some((server) => server.id === serverId);
      legacyServers = legacyServers.filter((server) => server.id !== serverId);
      return exists;
    });
    const manager = new RuntimeManager({
      workspaceManager: {
        getPath: vi.fn().mockReturnValue('/Users/daniel/project'),
        getRuntimeConfig: vi.fn().mockResolvedValue({ backend: 'host' }),
      } as unknown as WorkspaceManager,
      containerManager: { devServers: { list: legacyList, unregister } } as unknown as ContainerManager,
    });
    const events: unknown[] = [];

    manager.onDevServerChange((event) => events.push(event));
    await manager.getRuntime('workspace-a');

    expect(unregister).toHaveBeenCalledWith('workspace-a:workspace:root:7000');
    expect(events).toContainEqual(expect.objectContaining({
      type: 'unregistered',
      workspaceId: 'workspace-a',
      serverId: 'workspace-a:workspace:root:7000',
    }));
    expect(manager.listDevServersSync('workspace-a')).toEqual([]);
  });

  it('disposes terminal sessions without forcing a POSIX signal', async () => {
    const signal = vi.fn();
    const manager = new RuntimeManager({
      workspaceManager: {
        getPath: vi.fn().mockReturnValue('/Users/daniel/project'),
        getRuntimeConfig: vi.fn().mockResolvedValue({ backend: 'host' }),
      } as unknown as WorkspaceManager,
      containerManager: {} as ContainerManager,
    });
    const runtime = await manager.getRuntime('workspace-a');
    vi.spyOn(runtime, 'createTerminal').mockResolvedValue({
      terminalId: 'terminal-a',
      write: vi.fn(),
      signal,
      onData: vi.fn(() => vi.fn()),
      onExit: vi.fn(() => vi.fn()),
      replayBuffer: vi.fn(() => ''),
    });

    await manager.createTerminal('workspace-a', 'terminal-a');
    manager.disposeTerminal('terminal-a');

    expect(signal).toHaveBeenCalledWith();
    expect(manager.getTerminal('terminal-a')).toBeUndefined();
  });

  it('translates primary workspace paths between host and runtime roots', () => {
    expect(toRuntimeWorkspacePath('/Users/daniel/project', '/Users/daniel/project')).toBe('/workspace');
    expect(toRuntimeWorkspacePath('/Users/daniel/project', '/Users/daniel/project/src/App.tsx')).toBe('/workspace/src/App.tsx');
    expect(toRuntimeWorkspacePath('/Users/daniel/project', '/Users/daniel/other')).toBeNull();
    expect(toHostWorkspacePath('/Users/daniel/project', '/workspace/src/App.tsx')).toBe('/Users/daniel/project/src/App.tsx');
  });
});
