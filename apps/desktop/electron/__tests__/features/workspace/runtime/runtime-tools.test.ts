import { describe, expect, it, vi } from 'vitest';
import { Type } from 'typebox';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
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

  it('returns host coding tools plus sero-cli for OpenShell Local runtime', () => {
    const containerTools = vi.fn(() => [makeTool('container-only')]);
    const hostTools = vi.fn(() => [makeTool('read'), makeTool('write'), makeTool('edit')]);
    const cliTool = vi.fn(() => makeTool('sero-cli'));

    const tools = createRuntimeCodingTools(createRuntime('openshell-local'), {
      sessionId: 'session-openshell',
      deps: {
        containerManager: createContainerManager(),
        createContainerTools: containerTools,
        createHostCodingTools: hostTools,
        createWorkspaceCliTool: cliTool,
      },
    });

    expect(tools.map((tool) => tool.name)).toEqual(['read', 'write', 'edit', 'sero-cli']);
    expect(hostTools).toHaveBeenCalledWith('/tmp/ws');
    expect(cliTool).toHaveBeenCalledWith('ws-1', 'session-openshell');
    expect(containerTools).not.toHaveBeenCalled();
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

function createRuntime(actualRuntime: 'host' | 'container' | 'openshell-local'): WorkspaceRuntimeFacade {
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
      interactiveTerminal: actualRuntime !== 'openshell-local',
      directFileRead: actualRuntime === 'host',
      directFileWrite: actualRuntime === 'host',
      fileUpload: actualRuntime === 'openshell-local',
      fileDownload: actualRuntime === 'openshell-local',
      managedDevServers: actualRuntime !== 'host',
      browserAutomation: actualRuntime === 'container',
      portDiscovery: actualRuntime === 'container',
      portForward: actualRuntime === 'openshell-local',
      logStream: actualRuntime === 'openshell-local',
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

function getProviderId(actualRuntime: 'host' | 'container' | 'openshell-local') {
  if (actualRuntime === 'container') return 'apple-container';
  if (actualRuntime === 'openshell-local') return 'openshell-local';
  return 'host';
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
