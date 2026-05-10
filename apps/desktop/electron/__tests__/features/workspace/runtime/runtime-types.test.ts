import { describe, expect, it, vi } from 'vitest';
import {
  getRuntimeCapabilities,
  RUNTIME_BACKEND_IDS,
  RUNTIME_CAPABILITIES,
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
    expect(RUNTIME_BACKEND_IDS).toEqual(['apple-container', 'docker', 'mac-host']);
  });

  it.each(RUNTIME_BACKEND_IDS)('defines complete capabilities for %s', (backend) => {
    const capabilities = getRuntimeCapabilities(backend);

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
    expect(RUNTIME_CAPABILITIES['apple-container'].browserAutomation).toBe(true);
    expect(RUNTIME_CAPABILITIES.docker.browserAutomation).toBe(true);
    expect(RUNTIME_CAPABILITIES['apple-container'].languageServers).toBe(true);
    expect(RUNTIME_CAPABILITIES.docker.languageServers).toBe(true);
  });

  it('marks mac-host as host access without container-only preview capabilities', async () => {
    const manager = new RuntimeManager({
      workspaceManager: {
        getPath: vi.fn().mockReturnValue('/Users/daniel/project'),
        getRuntimeConfig: vi.fn().mockResolvedValue({ backend: 'mac-host' }),
      } as unknown as WorkspaceManager,
      containerManager: {} as ContainerManager,
    });

    const runtime = await manager.getRuntime('workspace-a');

    expect(runtime.backend).toBe('mac-host');
    expect(runtime.workspaceAccess).toBe('host');
    expect(runtime.runtimeWorkspacePath).toBe(RUNTIME_WORKSPACE_PATH);
    expect(runtime.capabilities.ports.previewUrl).toBe(false);
  });

  it('resolves and caches one real backend per workspace/backend pair', async () => {
    const resolveBackend = vi.fn<(workspaceId: string) => RuntimeBackendId>().mockReturnValue('mac-host');
    const manager = new RuntimeManager({
      workspaceManager: {
        getPath: vi.fn().mockReturnValue('/Users/daniel/project'),
        getRuntimeConfig: vi.fn().mockResolvedValue({ backend: 'mac-host' }),
      } as unknown as WorkspaceManager,
      containerManager: {} as ContainerManager,
      resolveBackend,
    });

    const first = await manager.getRuntime('workspace-a');
    const second = await manager.getRuntime('workspace-a');
    const health = await manager.getHealth('workspace-a');

    expect(first).toBe(second);
    expect(first.backend).toBe('mac-host');
    expect(first.workspaceAccess).toBe('host');
    expect(health).toMatchObject({ backend: 'mac-host', status: 'ready' });
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

  it('lists runtime-backed dev servers from cached runtimes', async () => {
    const manager = new RuntimeManager({
      workspaceManager: {
        getPath: vi.fn().mockReturnValue('/Users/daniel/project'),
        getRuntimeConfig: vi.fn().mockResolvedValue({ backend: 'mac-host' }),
      } as unknown as WorkspaceManager,
      containerManager: { devServers: { list: vi.fn(() => []) } } as unknown as ContainerManager,
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
  });

  it('translates primary workspace paths between host and runtime roots', () => {
    expect(toRuntimeWorkspacePath('/Users/daniel/project', '/Users/daniel/project')).toBe('/workspace');
    expect(toRuntimeWorkspacePath('/Users/daniel/project', '/Users/daniel/project/src/App.tsx')).toBe('/workspace/src/App.tsx');
    expect(toRuntimeWorkspacePath('/Users/daniel/project', '/Users/daniel/other')).toBeNull();
    expect(toHostWorkspacePath('/Users/daniel/project', '/workspace/src/App.tsx')).toBe('/Users/daniel/project/src/App.tsx');
  });
});
