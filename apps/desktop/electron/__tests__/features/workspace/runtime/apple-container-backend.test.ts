import { describe, expect, it, vi } from 'vitest';
import type { ContainerManager } from '@electron/features/container';
import type { WorkspaceManager } from '@electron/features/workspace/manager';
import { AppleContainerBackend } from '@electron/features/workspace/runtime/backends/apple-container-backend';
import type { RuntimeDevServer } from '@electron/features/workspace/runtime/types';

function createWorkspaceManager(): WorkspaceManager {
  return {
    getReferences: vi.fn().mockResolvedValue([]),
    getMounts: vi.fn().mockResolvedValue([]),
    getRoots: vi.fn().mockResolvedValue([]),
    getRuntimeConfig: vi.fn().mockResolvedValue({ backend: 'apple-container', previewPortPoolSize: 2 }),
  } as unknown as WorkspaceManager;
}

function createContainerManager() {
  const registeredServer = {
    id: 'workspace-a:workspace:root:5173',
    workspaceId: 'workspace-a',
    name: 'Vite',
    port: 5173,
    url: 'http://127.0.0.1:51000',
    command: 'pnpm dev',
    cwd: '/workspace',
    status: 'running' as const,
    registeredAt: '2026-05-10T00:00:00.000Z',
  };
  const containerManager = {
    ensureSystemRunning: vi.fn().mockResolvedValue(undefined),
    ensure: vi.fn().mockResolvedValue({
      id: 'sero-workspace-a',
      image: 'ghcr.io/sero-labs/sero-node:latest',
      state: 'running' as const,
      cpus: 2,
      memoryBytes: 1024,
    }),
    stop: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    exec: vi.fn().mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 }),
    readFile: vi.fn().mockResolvedValue('file content'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    listFiles: vi.fn().mockResolvedValue([{ name: 'a.txt', type: 'file' as const, size: 4 }]),
    terminals: {
      disposeWorkspaceTerminals: vi.fn(),
      createTerminal: vi.fn(),
      getReplayBuffer: vi.fn().mockReturnValue(''),
    },
    portScanner: {
      triggerScan: vi.fn(),
      getPorts: vi.fn().mockReturnValue([{ port: 5173, url: 'http://127.0.0.1:51000', bridged: true }]),
    },
    devServers: {
      register: vi.fn().mockReturnValue(registeredServer),
      stop: vi.fn().mockResolvedValue(true),
      restart: vi.fn().mockResolvedValue(true),
      get: vi.fn().mockReturnValue(registeredServer),
      list: vi.fn().mockReturnValue([registeredServer]),
    },
  };
  return containerManager;
}

function createBackend(containerManager = createContainerManager()): AppleContainerBackend {
  return new AppleContainerBackend({
    workspaceId: 'workspace-a',
    hostWorkspacePath: '/Users/daniel/project',
    workspaceManager: createWorkspaceManager(),
    containerManager: containerManager as unknown as ContainerManager,
    inspectApplePorts: async () => ({ configuration: { publishedPorts: [
      { hostAddress: '127.0.0.1', hostPort: 51000, containerPort: 32000 },
      { hostAddress: '127.0.0.1', hostPort: 51001, containerPort: 32001 },
    ] } }),
  });
}

describe('AppleContainerBackend', () => {
  it('delegates lifecycle to ContainerManager with workspace container config', async () => {
    const containerManager = createContainerManager();
    const backend = createBackend(containerManager);

    const session = await backend.ensure();

    expect(containerManager.ensure).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'workspace-a',
      hostPath: '/Users/daniel/project',
    }));
    expect(session).toMatchObject({
      backend: 'apple-container',
      workspaceId: 'workspace-a',
      runtimeWorkspacePath: '/workspace',
      state: 'running',
      containerId: 'sero-workspace-a',
    });
  });

  it('delegates exec and file primitives without host fallback', async () => {
    const containerManager = createContainerManager();
    const backend = createBackend(containerManager);

    await expect(backend.exec({ command: 'pwd', cwd: '/workspace', injectGitAuth: true })).resolves.toEqual({
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    });
    await expect(backend.readFile({ path: '/workspace/a.txt' })).resolves.toEqual({
      content: 'file content',
      encoding: 'utf8',
    });
    await backend.writeFile({ path: '/workspace/a.txt', content: 'next' });
    await expect(backend.listFiles({ path: '/workspace' })).resolves.toEqual([
      { name: 'a.txt', path: '/workspace/a.txt', type: 'file', size: 4 },
    ]);

    expect(containerManager.ensure).toHaveBeenCalledTimes(1);
    expect(containerManager.exec).toHaveBeenCalledWith('workspace-a', 'pwd', '/workspace', undefined, {
      injectGitAuth: true,
    });
    expect(containerManager.readFile).toHaveBeenCalledWith('workspace-a', '/workspace/a.txt');
    expect(containerManager.writeFile).toHaveBeenCalledWith('workspace-a', '/workspace/a.txt', 'next');
  });

  it('reads binary files as base64 without UTF-8 corruption', async () => {
    const containerManager = createContainerManager();
    containerManager.exec.mockResolvedValue({ stdout: 'AAECA/8=', stderr: '', exitCode: 0 });
    const backend = createBackend(containerManager);

    await expect(backend.readFile({ path: '/workspace/video.webm', binary: true })).resolves.toEqual({
      content: 'AAECA/8=',
      encoding: 'base64',
    });

    expect(containerManager.readFile).not.toHaveBeenCalled();
    expect(containerManager.exec).toHaveBeenCalledWith('workspace-a', "base64 -w0 -- '/workspace/video.webm'", '/workspace', undefined, {
      injectGitAuth: undefined,
    });
  });

  it('surfaces selected Apple Container failures instead of falling back to host', async () => {
    const containerManager = createContainerManager();
    containerManager.ensure.mockRejectedValue(new Error('container CLI missing'));
    const backend = createBackend(containerManager);

    await expect(backend.exec({ command: 'pwd' })).rejects.toThrow('container CLI missing');
    expect(containerManager.exec).not.toHaveBeenCalled();
  });

  it('throws when shell-backed file mutations fail', async () => {
    const containerManager = createContainerManager();
    containerManager.exec.mockResolvedValue({ stdout: '', stderr: 'permission denied', exitCode: 1 });
    const backend = createBackend(containerManager);

    await expect(backend.rename({ oldPath: '/workspace/a', newPath: '/workspace/b' })).rejects.toThrow('permission denied');
    await expect(backend.delete({ path: '/workspace/a' })).rejects.toThrow('permission denied');
    await expect(backend.createDirectory({ path: '/workspace/a', recursive: true })).rejects.toThrow('permission denied');
  });

  it('emits dev-server registration and unregistration events', async () => {
    const server: RuntimeDevServer = {
      id: 'workspace-a:workspace:root:5173',
      port: 5173,
      url: 'http://127.0.0.1:51000',
      command: 'pnpm dev',
      cwd: '/workspace',
    };
    const ports = {
      detectPorts: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([5173]),
      forwardPort: vi.fn().mockResolvedValue({ targetPort: 5173, hostPort: 51000, url: server.url, bridged: true }),
      registerServer: vi.fn().mockReturnValue(server),
      getServer: vi.fn().mockReturnValue(server),
      stopForward: vi.fn().mockResolvedValue(undefined),
      deleteServer: vi.fn().mockReturnValue(true),
    };
    const containerManager = createContainerManager();
    const backend = createBackend(containerManager);
    vi.spyOn(backend, 'ensure').mockResolvedValue({
      backend: 'apple-container',
      workspaceId: 'workspace-a',
      hostWorkspacePath: '/Users/daniel/project',
      runtimeWorkspacePath: '/workspace',
      state: 'running',
    });
    Object.assign(backend as unknown as { ports: typeof ports }, { ports });
    const events: unknown[] = [];
    backend.onDevServerChange((event) => events.push(event));

    const started = await backend.startDevServer({ command: 'pnpm dev', cwd: '/workspace' });
    await backend.stopDevServer({ serverId: started.id });

    expect(events).toEqual([
      expect.objectContaining({ type: 'registered', workspaceId: 'workspace-a', serverId: server.id, status: 'running' }),
      expect.objectContaining({ type: 'unregistered', workspaceId: 'workspace-a', serverId: server.id, status: 'stopped' }),
    ]);
  });

  it('resolves preview URLs through loopback host-port pool bridges', async () => {
    const containerManager = createContainerManager();
    const backend = createBackend(containerManager);

    const preview = await backend.resolvePreviewUrl({ targetPort: 5173 });

    expect(preview).toMatchObject({ targetPort: 5173, backend: 'apple-container' });
    expect(preview.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(preview.hostPort).not.toBe(5173);
    expect(containerManager.exec).toHaveBeenCalledWith(
      'workspace-a',
      expect.stringContaining('sero-preview-bridge-workspace-a-5173-32000'),
      '/workspace',
      10_000,
    );
  });
});
