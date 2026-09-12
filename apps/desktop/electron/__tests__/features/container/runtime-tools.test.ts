import { describe, expect, it, vi } from 'vitest';

import { createRuntimeTools } from '@electron/features/container/tools';
import { createMemberRuntimeTools } from '@electron/features/apps/runtime/capabilities/persistent-sessions/member-runtime-tools';
import { applyPermissionProfile } from '@electron/features/apps/runtime/capabilities/persistent-sessions/permission-tools';
import { runtimeManager } from '@electron/features/workspace/runtime/runtime-manager';
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

vi.mock('@electron/features/workspace/runtime/runtime-manager', () => ({
  runtimeManager: { getRuntime: vi.fn() },
}));

describe('persistent member runtime tools', () => {
  it('runs approved bash through the workspace runtime with the member cwd and CLI scope', async () => {
    const runtime = fakeRuntime('host', { backend: 'host', status: 'ready', message: 'ready', checks: [] });
    vi.mocked(runtimeManager.getRuntime).mockResolvedValue(runtime);
    const tools = await createMemberRuntimeTools('ws-1', ['bash'], '/project', 'grant-1:owner');
    const bash = tools.find((tool) => tool.name === 'bash');
    if (!bash) throw new Error('Approved bash missing');
    // Runtime bash does not read the Pi extension context.
    await bash.execute('call-1', { command: 'node --version' }, undefined, undefined, undefined as never);
    expect(runtime.exec).toHaveBeenLastCalledWith({
      command: 'node --version', cwd: '/project', timeoutMs: undefined,
      env: { SERO_SESSION_ID: 'grant-1:owner' },
      // Bash streams its complete output into a capture sink.
      outputSink: expect.objectContaining({ write: expect.any(Function), close: expect.any(Function) }),
    });
    expect(tools.map((tool) => tool.name)).toEqual(['bash']);
  });

  it('creates the real browser tool for an approved member in its own workspace', async () => {
    const runtime = fakeRuntime('host', {
      backend: 'host', status: 'ready', message: 'ready',
      checks: [{ id: 'runtime.host.browser', category: 'runtime', status: 'pass', message: 'ready', durationMs: 1 }],
    });
    vi.mocked(runtimeManager.getRuntime).mockResolvedValue(runtime);
    const tools = await createMemberRuntimeTools('ws-1', ['read', 'automation_browser']);
    expect(runtimeManager.getRuntime).toHaveBeenLastCalledWith('ws-1');
    expect(runtime.ensure).toHaveBeenCalledOnce();
    expect(tools.map((tool) => tool.name)).toEqual(['automation_browser']);
  });

  it('does not start a runtime when the permission profile excludes network access', async () => {
    vi.mocked(runtimeManager.getRuntime).mockClear();
    const { allowed } = applyPermissionProfile(['read', 'bash', 'automation_browser'], {
      filesystem: 'read', commands: 'none', network: 'none', vcs: 'read',
    });
    expect(await createMemberRuntimeTools('ws-1', allowed)).toEqual([]);
    expect(runtimeManager.getRuntime).not.toHaveBeenCalled();
  });

  it('reports an unavailable approved browser before starting a member without it', async () => {
    vi.mocked(runtimeManager.getRuntime).mockResolvedValue(fakeRuntime('host', {
      backend: 'host', status: 'ready', message: 'ready', checks: [],
    }));
    await expect(createMemberRuntimeTools('ws-1', ['automation_browser']))
      .rejects.toThrow('approved automation browser is unavailable in workspace ws-1');
  });
});

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
