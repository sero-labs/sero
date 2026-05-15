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

  it('destroy removes the container rather than just stopping it (parity with Docker)', async () => {
    const containerManager = createContainerManager();
    const backend = createBackend(containerManager);

    await backend.ensure();
    await backend.destroy();

    expect(containerManager.remove).toHaveBeenCalledWith('workspace-a');
    expect(containerManager.stop).not.toHaveBeenCalled();
  });

  it('passes isolated exec requests into the first container config build', async () => {
    const containerManager = createContainerManager();
    const workspaceManager = createWorkspaceManager();
    const backend = new AppleContainerBackend({
      workspaceId: 'workspace-a',
      hostWorkspacePath: '/Users/daniel/project',
      workspaceManager,
      containerManager: containerManager as unknown as ContainerManager,
      inspectApplePorts: async () => ({ configuration: { publishedPorts: [
        { hostAddress: '127.0.0.1', hostPort: 51000, containerPort: 32000 },
        { hostAddress: '127.0.0.1', hostPort: 51001, containerPort: 32001 },
      ] } }),
    });

    await backend.exec({ command: 'pwd', isolated: true });

    expect(workspaceManager.getReferences).not.toHaveBeenCalled();
    expect(workspaceManager.getMounts).not.toHaveBeenCalled();
    expect(workspaceManager.getRoots).not.toHaveBeenCalled();
    expect(containerManager.ensure).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'workspace-a',
      writableMounts: [],
    }));
  });

  it('recreates an existing non-isolated session for isolated exec requests', async () => {
    const containerManager = createContainerManager();
    const workspaceManager = createWorkspaceManager();
    workspaceManager.getReferences = vi.fn().mockResolvedValue(['other-workspace']);
    workspaceManager.getPath = vi.fn().mockReturnValue('/Users/daniel/other');
    const backend = new AppleContainerBackend({
      workspaceId: 'workspace-a',
      hostWorkspacePath: '/Users/daniel/project',
      workspaceManager,
      containerManager: containerManager as unknown as ContainerManager,
      inspectApplePorts: async () => ({ configuration: { publishedPorts: [
        { hostAddress: '127.0.0.1', hostPort: 51000, containerPort: 32000 },
        { hostAddress: '127.0.0.1', hostPort: 51001, containerPort: 32001 },
      ] } }),
    });

    await backend.ensure();
    await backend.exec({ command: 'pwd', isolated: true });

    expect(containerManager.remove).toHaveBeenCalledWith('workspace-a');
    expect(containerManager.ensure).toHaveBeenCalledTimes(2);
    expect(containerManager.ensure).toHaveBeenLastCalledWith(expect.objectContaining({ writableMounts: [] }));
  });

  it('quotes valid exec environment values', async () => {
    const containerManager = createContainerManager();
    const backend = createBackend(containerManager);

    await backend.exec({ command: 'node -e "console.log(process.env.SAFE_KEY)"', env: { SAFE_KEY: "has ' quote" } });

    expect(containerManager.exec).toHaveBeenCalledWith(
      'workspace-a',
      "SAFE_KEY='has '\\'' quote' node -e \"console.log(process.env.SAFE_KEY)\"",
      '/workspace',
      undefined,
      { injectGitAuth: undefined },
    );
  });

  it('rejects invalid exec environment keys before ensuring the container', async () => {
    const containerManager = createContainerManager();
    const backend = createBackend(containerManager);

    await expect(backend.exec({ command: 'env', env: { 'BAD-KEY': 'value' } }))
      .rejects.toThrow('Invalid environment variable name: BAD-KEY');

    expect(containerManager.ensure).not.toHaveBeenCalled();
    expect(containerManager.exec).not.toHaveBeenCalled();
  });

  it('quotes valid execFile environment values and argv', async () => {
    const containerManager = createContainerManager();
    const backend = createBackend(containerManager);

    await backend.execFile({
      program: 'node',
      args: ['script path.js', "it's ok"],
      cwd: '/workspace/app',
      timeoutMs: 5_000,
      env: { SAFE_KEY: 'value', _ALSO_SAFE1: "has ' quote" },
    });

    expect(containerManager.exec).toHaveBeenCalledWith(
      'workspace-a',
      "SAFE_KEY='value' _ALSO_SAFE1='has '\\'' quote' 'node' 'script path.js' 'it'\\''s ok'",
      '/workspace/app',
      5_000,
      { injectGitAuth: undefined },
    );
  });

  it.each(['BAD-KEY', 'A=B', 'X;touch /tmp/pwned'])(
    'rejects invalid execFile environment key %s before execution',
    async (key) => {
      const containerManager = createContainerManager();
      const backend = createBackend(containerManager);

      await expect(backend.execFile({ program: 'env', args: [], env: { [key]: 'value' } }))
        .rejects.toThrow(`Invalid environment variable name: ${key}`);

      expect(containerManager.exec).not.toHaveBeenCalled();
    },
  );

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

  it('keeps stopped dev servers registered so they can be restarted', async () => {
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
    containerManager.exec.mockImplementation(async (_workspaceId: string, command: string) => ({
      stdout: command.includes('setsid') ? '1234\n' : '',
      stderr: '',
      exitCode: 0,
    }));
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
      expect.objectContaining({ type: 'status_changed', workspaceId: 'workspace-a', serverId: server.id, status: 'stopped' }),
    ]);
  });

  it('preserves dev-server metadata on restart', async () => {
    const server: RuntimeDevServer = {
      id: 'workspace-a:card-preview:card-1:5173',
      port: 5173,
      url: 'http://127.0.0.1:51000',
      command: 'pnpm dev',
      cwd: '/workspace/app',
      name: 'Card Preview',
      framework: 'vite',
      scope: 'card-preview',
      cardId: 'card-1',
    };
    const backend = createBackend();
    Object.assign(backend as unknown as { ports: { getServer: (id: string) => RuntimeDevServer | undefined; deleteServer: (id: string) => boolean } }, {
      ports: { getServer: vi.fn().mockReturnValue(server), deleteServer: vi.fn().mockReturnValue(true) },
    });
    vi.spyOn(backend, 'stopDevServer').mockResolvedValue(undefined);
    const start = vi.spyOn(backend, 'startDevServer').mockResolvedValue(server);

    await backend.restartDevServer({ serverId: server.id });

    expect(start).toHaveBeenCalledWith({
      command: 'pnpm dev',
      cwd: '/workspace/app',
      name: 'Card Preview',
      framework: 'vite',
      scope: 'card-preview',
      cardId: 'card-1',
    });
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
