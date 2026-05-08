import { describe, expect, it, vi } from 'vitest';
import { Type } from 'typebox';
import type { ExtensionContext, ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { IPty } from 'node-pty';
import type { ContainerManager } from '@electron/features/container';
import { createRuntimeCodingTools } from '@electron/features/workspace/runtime/runtime-tools';
import type { WorkspaceRuntimeFacade } from '@electron/features/workspace/runtime/types';

function makeTool(name: string): ToolDefinition {
  return {
    name,
    label: name,
    description: `${name} tool`,
    parameters: Type.Object({}),
    execute: async () => ({ content: [{ type: 'text' as const, text: 'ok' }], details: undefined }),
  };
}

function createMockExtensionContext(): ExtensionContext {
  return {
    cwd: '/tmp/ws',
    model: undefined,
    modelRegistry: { getApiKeyAndHeaders: vi.fn() } as unknown as ExtensionContext['modelRegistry'],
    sessionManager: { getSessionId: vi.fn(() => 'session-openshell') } as unknown as ExtensionContext['sessionManager'],
    hasUI: false,
    ui: { notify: vi.fn() } as unknown as ExtensionContext['ui'],
    isIdle: vi.fn(() => true),
    signal: undefined,
    abort: vi.fn(),
    hasPendingMessages: vi.fn(() => false),
    shutdown: vi.fn(),
    getContextUsage: vi.fn(() => undefined),
    compact: vi.fn(),
    getSystemPrompt: vi.fn(() => ''),
  };
}

describe('createRuntimeCodingTools', () => {
  it('returns host coding tools plus sero-cli for host runtime', () => {
    const containerTools = vi.fn(() => [makeTool('container-only')]);
    const hostTools = vi.fn(() => [
      makeTool('bash'),
      makeTool('read'),
      makeTool('write'),
      makeTool('edit'),
    ]);
    const cliTool = vi.fn(() => makeTool('sero-cli'));

    const tools = createRuntimeCodingTools(createRuntime('host'), {
      sessionId: 'session-1',
      deps: {
        containerManager: createContainerManager(),
        createContainerTools: containerTools,
        createHostCodingTools: hostTools,
        createWorkspaceCliTool: cliTool,
      },
    });

    expect(tools.map((tool) => tool.name)).toEqual(['bash', 'read', 'write', 'edit', 'sero-cli']);
    expect(hostTools).toHaveBeenCalledWith('/tmp/ws');
    expect(cliTool).toHaveBeenCalledWith('ws-1', 'session-1');
    expect(containerTools).not.toHaveBeenCalled();
  });

  it('returns runtime bash plus sandbox file tools and sero-cli for OpenShell Local runtime', async () => {
    const containerTools = vi.fn(() => [makeTool('container-only')]);
    const hostTools = vi.fn(() => [
      makeTool('bash'),
      makeTool('read'),
      makeTool('write'),
      makeTool('edit'),
    ]);
    const cliTool = vi.fn(() => makeTool('sero-cli'));
    const runtime = createRuntime('openshell-local');
    const runtimeExec = vi.fn(async () => ({ stdout: 'Linux\n/workspace/ws', stderr: '', exitCode: 0 }));
    runtime.exec = runtimeExec;

    const tools = createRuntimeCodingTools(runtime, {
      sessionId: 'session-openshell',
      deps: {
        containerManager: createContainerManager(),
        createContainerTools: containerTools,
        createHostCodingTools: hostTools,
        createWorkspaceCliTool: cliTool,
      },
    });

    expect(tools.map((tool) => tool.name)).toEqual(['bash', 'read', 'write', 'edit', 'sero-cli']);
    expect(hostTools).not.toHaveBeenCalled();
    expect(cliTool).toHaveBeenCalledWith('ws-1', 'session-openshell');
    expect(containerTools).not.toHaveBeenCalled();

    const bash = tools.find((tool) => tool.name === 'bash');
    await expect(
      bash?.execute(
        'tool-1',
        { command: 'uname -s', timeout: 5 },
        undefined,
        undefined,
        createMockExtensionContext(),
      ),
    ).resolves.toMatchObject({
      content: [{ type: 'text', text: 'Linux\n/workspace/ws' }],
      details: {
        exitCode: 0,
        providerId: 'openshell-local',
        runtime: 'openshell-local',
      },
    });
    expect(runtimeExec).toHaveBeenCalledWith('uname -s', { cwd: '/tmp/ws', timeoutMs: 5000 });

    const read = tools.find((tool) => tool.name === 'read');
    runtimeExec
      .mockResolvedValueOnce({ stdout: '/sandbox/workspace/ws/note.txt', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'hello from sandbox', stderr: '', exitCode: 0 });
    await expect(
      read?.execute(
        'tool-read',
        { path: 'note.txt' },
        undefined,
        undefined,
        createMockExtensionContext(),
      ),
    ).resolves.toMatchObject({
      content: [{ type: 'text', text: 'hello from sandbox' }],
      details: { path: '/sandbox/workspace/ws/note.txt' },
    });
    expect(hostTools).not.toHaveBeenCalled();
  });

  it('returns runtime bash plus Remote-specific sandbox file tools for OpenShell Remote runtime', async () => {
    const containerTools = vi.fn(() => [makeTool('container-only')]);
    const hostTools = vi.fn(() => [makeTool('host-only')]);
    const cliTool = vi.fn(() => makeTool('sero-cli'));
    const runtime = createRuntime('openshell-remote');
    const runtimeExec = vi.fn(async () => ({ stdout: 'Linux remote', stderr: '', exitCode: 0 }));
    runtime.exec = runtimeExec;

    const tools = createRuntimeCodingTools(runtime, {
      sessionId: 'session-remote',
      deps: {
        containerManager: createContainerManager(),
        createContainerTools: containerTools,
        createHostCodingTools: hostTools,
        createWorkspaceCliTool: cliTool,
      },
    });

    expect(tools.map((tool) => tool.name)).toEqual(['bash', 'read', 'write', 'edit', 'sero-cli']);
    expect(hostTools).not.toHaveBeenCalled();
    expect(containerTools).not.toHaveBeenCalled();

    const bash = tools.find((tool) => tool.name === 'bash');
    await expect(
      bash?.execute(
        'tool-remote',
        { command: 'uname -s', timeout: 5 },
        undefined,
        undefined,
        createMockExtensionContext(),
      ),
    ).resolves.toMatchObject({
      content: [{ type: 'text', text: 'Linux remote' }],
      details: {
        exitCode: 0,
        providerId: 'openshell-remote',
        runtime: 'openshell-remote',
      },
    });
    expect(runtimeExec).toHaveBeenCalledWith('uname -s', { cwd: '/tmp/ws', timeoutMs: 5000 });

    const write = tools.find((tool) => tool.name === 'write');
    runtimeExec.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
    await expect(
      write?.execute(
        'tool-write',
        { path: 'remote.txt', content: 'written remotely' },
        undefined,
        undefined,
        createMockExtensionContext(),
      ),
    ).resolves.toMatchObject({
      content: [{ type: 'text', text: 'Successfully wrote 16 bytes to remote.txt' }],
      details: { path: '/sandbox/workspace/ws/remote.txt' },
    });
    expect(hostTools).not.toHaveBeenCalled();
  });

  it('returns runtime bash plus Cloud-specific sandbox file tools for OpenShell Cloud runtime', async () => {
    const containerTools = vi.fn(() => [makeTool('container-only')]);
    const hostTools = vi.fn(() => [makeTool('host-only')]);
    const cliTool = vi.fn(() => makeTool('sero-cli'));
    const runtime = createRuntime('openshell-cloud');
    const runtimeExec = vi.fn(async () => ({ stdout: '', stderr: 'cloud gateway unavailable', exitCode: 1 }));
    runtime.exec = runtimeExec;

    const tools = createRuntimeCodingTools(runtime, {
      sessionId: 'session-cloud',
      deps: {
        containerManager: createContainerManager(),
        createContainerTools: containerTools,
        createHostCodingTools: hostTools,
        createWorkspaceCliTool: cliTool,
      },
    });

    expect(tools.map((tool) => tool.name)).toEqual(['bash', 'read', 'write', 'edit', 'sero-cli']);
    expect(hostTools).not.toHaveBeenCalled();
    expect(containerTools).not.toHaveBeenCalled();

    const bash = tools.find((tool) => tool.name === 'bash');
    await expect(
      bash?.execute(
        'tool-cloud',
        { command: 'uname -s', timeout: 5 },
        undefined,
        undefined,
        createMockExtensionContext(),
      ),
    ).rejects.toThrow(/OpenShell Cloud runtime command failed.*cloud gateway unavailable.*Command exited with code 1/s);
    expect(runtimeExec).toHaveBeenCalledWith('uname -s', { cwd: '/tmp/ws', timeoutMs: 5000 });

    const read = tools.find((tool) => tool.name === 'read');
    await expect(
      read?.execute(
        'tool-read-cloud',
        { path: 'cloud.txt' },
        undefined,
        undefined,
        createMockExtensionContext(),
      ),
    ).rejects.toThrow(/Error reading cloud.txt: cloud gateway unavailable/s);
    expect(hostTools).not.toHaveBeenCalled();
  });

  it('edits unique text in an OpenShell sandbox and returns diff metadata', async () => {
    const runtime = createRuntime('openshell-local');
    const runtimeExec = vi.fn()
      .mockResolvedValueOnce({ stdout: '/sandbox/workspace/ws/file.txt', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'alpha\nbeta\ngamma\n', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
    runtime.exec = runtimeExec;

    const tools = createRuntimeCodingTools(runtime, {
      sessionId: 'session-openshell',
      deps: {
        containerManager: createContainerManager(),
        createContainerTools: vi.fn(() => []),
        createHostCodingTools: vi.fn(() => [makeTool('host-only')]),
        createWorkspaceCliTool: vi.fn(() => makeTool('sero-cli')),
      },
    });

    const edit = tools.find((tool) => tool.name === 'edit');
    await expect(
      edit?.execute(
        'tool-edit',
        { path: 'file.txt', oldText: 'beta', newText: 'BETA' },
        undefined,
        undefined,
        createMockExtensionContext(),
      ),
    ).resolves.toMatchObject({
      content: [{ type: 'text', text: 'Successfully replaced text in file.txt.' }],
      details: {
        path: '/sandbox/workspace/ws/file.txt',
        firstChangedLine: 2,
      },
    });
    expect(runtimeExec).toHaveBeenCalledTimes(3);
  });

  it('blocks protected memory access for OpenShell file tools before runtime execution', async () => {
    const runtime = createRuntime('openshell-local');
    const runtimeExec = vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 }));
    runtime.exec = runtimeExec;
    const tools = createRuntimeCodingTools(runtime, {
      sessionId: 'session-openshell',
      deps: {
        containerManager: createContainerManager(),
        createContainerTools: vi.fn(() => []),
        createHostCodingTools: vi.fn(() => [makeTool('host-only')]),
        createWorkspaceCliTool: vi.fn(() => makeTool('sero-cli')),
      },
    });
    const read = tools.find((tool) => tool.name === 'read');
    await expect(
      read?.execute(
        'tool-read-protected',
        { path: `${process.env.SERO_HOME || `${process.env.HOME}/.sero-ui`}/workspaces/global/MEMORY.md` },
        undefined,
        undefined,
        createMockExtensionContext(),
      ),
    ).rejects.toThrow(/managed Sero memory files is blocked/);
    expect(runtimeExec).not.toHaveBeenCalled();
  });

  it('mentions OpenShell Local and exit code when runtime bash exits non-zero', async () => {
    const runtime = createRuntime('openshell-local');
    runtime.exec = vi.fn(async () => ({
      stdout: 'partial stdout',
      stderr: 'failure stderr',
      exitCode: 2,
    }));

    const tools = createRuntimeCodingTools(runtime, {
      sessionId: 'session-openshell',
      deps: {
        containerManager: createContainerManager(),
        createContainerTools: vi.fn(() => []),
        createHostCodingTools: vi.fn(() => [makeTool('host-only')]),
        createWorkspaceCliTool: vi.fn(() => makeTool('sero-cli')),
      },
    });
    const bash = tools.find((tool) => tool.name === 'bash');

    await expect(
      bash?.execute(
        'tool-1',
        { command: 'false', timeout: 5 },
        undefined,
        undefined,
        createMockExtensionContext(),
      ),
    ).rejects.toThrow(/OpenShell Local runtime command failed.*Command exited with code 2/s);
  });

  it('delegates container runtime tools to existing createContainerTools behavior', () => {
    const expectedTools = [
      makeTool('bash'),
      makeTool('read'),
      makeTool('write'),
      makeTool('edit'),
      makeTool('sero-cli'),
      makeTool('browser'),
    ];
    const containerManager = createContainerManager();
    const containerTools = vi.fn(() => expectedTools);
    const hostTools = vi.fn(() => [makeTool('host-only')]);

    const tools = createRuntimeCodingTools(createRuntime('container'), {
      sessionId: 'session-2',
      containerCwd: '/workspace/packages/app',
      deps: {
        containerManager,
        createContainerTools: containerTools,
        createHostCodingTools: hostTools,
        createWorkspaceCliTool: vi.fn(() => makeTool('sero-cli')),
      },
    });

    expect(tools).toBe(expectedTools);
    expect(tools.map((tool) => tool.name)).toEqual([
      'bash',
      'read',
      'write',
      'edit',
      'sero-cli',
      'browser',
    ]);
    expect(containerTools).toHaveBeenCalledWith(
      containerManager,
      'ws-1',
      'session-2',
      '/workspace/packages/app',
    );
    expect(hostTools).not.toHaveBeenCalled();
  });

  it('can force host tools when a container runtime setup falls back softly', () => {
    const hostTools = vi.fn(() => [makeTool('bash')]);
    const containerTools = vi.fn(() => [makeTool('browser')]);
    const cliTool = vi.fn(() => makeTool('sero-cli'));

    const tools = createRuntimeCodingTools(createRuntime('container'), {
      sessionId: 'session-3',
      hostCwd: '/tmp/ws-worktree',
      forceHost: true,
      deps: {
        containerManager: createContainerManager(),
        createContainerTools: containerTools,
        createHostCodingTools: hostTools,
        createWorkspaceCliTool: cliTool,
      },
    });

    expect(tools.map((tool) => tool.name)).toEqual(['bash', 'sero-cli']);
    expect(hostTools).toHaveBeenCalledWith('/tmp/ws-worktree');
    expect(cliTool).toHaveBeenCalledWith('ws-1', 'session-3');
    expect(containerTools).not.toHaveBeenCalled();
  });
});

function createRuntime(
  actualRuntime: 'host' | 'container' | 'openshell-local' | 'openshell-remote' | 'openshell-cloud',
): WorkspaceRuntimeFacade {
  return {
    workspaceId: 'ws-1',
    workspacePath: '/tmp/ws',
    providerId: getProviderId(actualRuntime),
    actualRuntime,
    resolution: {
      workspaceId: 'ws-1',
      workspacePath: '/tmp/ws',
      desiredRuntime: actualRuntime,
      actualRuntime,
      containerEnabled: actualRuntime === 'container',
      capabilityAudit: [],
    },
    capabilities: {
      exec: true,
      interactiveTerminal: !isOpenShellRuntime(actualRuntime),
      directFileRead: actualRuntime === 'host',
      directFileWrite: actualRuntime === 'host',
      fileUpload: isOpenShellRuntime(actualRuntime),
      fileDownload: isOpenShellRuntime(actualRuntime),
      managedDevServers: actualRuntime !== 'host',
      browserAutomation: actualRuntime === 'container',
      portDiscovery: actualRuntime === 'container',
      portForward: isOpenShellRuntime(actualRuntime),
      logStream: isOpenShellRuntime(actualRuntime),
    },
    health: async () => ({
      providerId: getProviderId(actualRuntime),
      status: 'ready',
    }),
    exec: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
    createTerminal: async () => ({
      pty: createPty(),
      runtime: actualRuntime === 'container' ? 'container' : 'host',
    }),
  };
}

function getProviderId(actualRuntime: 'host' | 'container' | 'openshell-local' | 'openshell-remote' | 'openshell-cloud') {
  if (actualRuntime === 'container') return 'apple-container';
  if (isOpenShellRuntime(actualRuntime)) return actualRuntime;
  return 'host';
}

function isOpenShellRuntime(
  actualRuntime: 'host' | 'container' | 'openshell-local' | 'openshell-remote' | 'openshell-cloud',
): actualRuntime is 'openshell-local' | 'openshell-remote' | 'openshell-cloud' {
  return actualRuntime === 'openshell-local'
    || actualRuntime === 'openshell-remote'
    || actualRuntime === 'openshell-cloud';
}

function createContainerManager(): ContainerManager {
  return { terminals: {} } as ContainerManager;
}

function createPty(): IPty {
  return {
    pid: 1,
    process: 'test',
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    clear: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    kill: vi.fn(),
  } as unknown as IPty;
}
