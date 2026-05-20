import { describe, expect, it, vi } from 'vitest';

import { createRuntimeTools } from '@electron/features/container/tools';
import { getRuntimeCapabilities } from '@electron/features/workspace/runtime/capabilities';
import type {
  RuntimeBackend,
  RuntimeCapabilities,
  RuntimeFileReadResult,
  RuntimeHealth,
  RuntimeSession,
} from '@electron/features/workspace/runtime/types';

vi.mock('@electron/cli', () => ({
  createWorkspaceCliTool: () => ({
    name: 'sero-cli',
    label: 'sero-cli',
    description: 'Sero CLI',
    parameters: { type: 'object', properties: {} },
    execute: async () => ({ content: [] }),
  }),
}));

describe('createRuntimeTools browser automation gating', () => {
  it('omits automation_browser for host runtimes until browser pack is ready', async () => {
    const runtime = fakeRuntime('host', {
      backend: 'host',
      status: 'ready',
      message: 'ready',
      checks: [{
        id: 'runtime.host.browser',
        category: 'runtime',
        status: 'warn',
        message: 'installable',
        durationMs: 1,
        details: { installState: 'installable' },
      }],
    });

    const tools = await createRuntimeTools(runtime, 'session-1');

    expect(toolNames(tools)).not.toContain('automation_browser');
  });

  it('includes automation_browser for host runtimes after browser pack readiness is confirmed', async () => {
    const runtime = fakeRuntime('host', {
      backend: 'host',
      status: 'ready',
      message: 'ready',
      checks: [{
        id: 'runtime.host.browser',
        category: 'runtime',
        status: 'pass',
        message: 'ready',
        durationMs: 1,
        details: { installState: 'ready' },
      }],
    });

    const tools = await createRuntimeTools(runtime, 'session-1');

    expect(toolNames(tools)).toContain('automation_browser');
  });

  it('keeps container browser tooling based on static runtime support', async () => {
    const runtime = fakeRuntime('docker', {
      backend: 'docker',
      status: 'ready',
      message: 'ready',
    });

    const tools = await createRuntimeTools(runtime, 'session-1');

    expect(runtime.health).not.toHaveBeenCalled();
    expect(toolNames(tools)).toContain('automation_browser');
  });
});

function toolNames(tools: Awaited<ReturnType<typeof createRuntimeTools>>): string[] {
  return tools.map((tool) => tool.name);
}

function fakeRuntime(backend: RuntimeBackend['backend'], health: RuntimeHealth): RuntimeBackend {
  const capabilities: RuntimeCapabilities = getRuntimeCapabilities(backend, 'darwin', 'arm64');
  return {
    backend,
    workspaceId: 'ws-1',
    hostWorkspacePath: '/tmp/ws-1',
    runtimeWorkspacePath: '/workspace',
    workspaceAccess: backend === 'host' ? 'host' : 'live-mount',
    capabilities,
    health: vi.fn(async () => health),
    ensure: vi.fn(async (): Promise<RuntimeSession> => ({
      backend,
      workspaceId: 'ws-1',
      hostWorkspacePath: '/tmp/ws-1',
      runtimeWorkspacePath: '/workspace',
      state: 'running',
    })),
    destroy: vi.fn(async () => undefined),
    exec: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
    execFile: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
    isSshAvailable: vi.fn(async () => true),
    spawn: vi.fn(async () => ({
      write: () => undefined,
      signal: () => undefined,
      onData: () => () => undefined,
      onExit: () => () => undefined,
    })),
    readFile: vi.fn(async (): Promise<RuntimeFileReadResult> => ({ content: '', encoding: 'utf8' })),
    writeFile: vi.fn(async () => undefined),
    listFiles: vi.fn(async () => []),
    rename: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    createFile: vi.fn(async () => undefined),
    createDirectory: vi.fn(async () => undefined),
    watchFiles: vi.fn(async () => ({ close: async () => undefined })),
    createTerminal: vi.fn(async () => ({
      terminalId: 'terminal-1',
      write: () => undefined,
      signal: () => undefined,
      onData: () => () => undefined,
      onExit: () => () => undefined,
      replayBuffer: () => '',
    })),
    startDevServer: vi.fn(async () => ({ id: 'server-1', port: 5173, url: 'http://127.0.0.1:5173', command: 'pnpm dev', cwd: '/workspace' })),
    stopDevServer: vi.fn(async () => undefined),
    restartDevServer: vi.fn(async () => ({ id: 'server-1', port: 5173, url: 'http://127.0.0.1:5173', command: 'pnpm dev', cwd: '/workspace' })),
    getDevServerStatus: vi.fn(async () => ({ servers: [] })),
    forwardPort: vi.fn(async () => ({ targetPort: 5173, hostPort: 5173, url: 'http://127.0.0.1:5173', bridged: false })),
    stopForward: vi.fn(async () => undefined),
    resolvePreviewUrl: vi.fn(async () => ({ url: 'http://127.0.0.1:5173', targetPort: 5173, backend })),
  };
}
