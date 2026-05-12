import { describe, expect, it, vi } from 'vitest';

import { HostDevServerManager, parseLsofPort } from '@electron/features/workspace/runtime/backends/host/host-dev-server-manager';
import type { RuntimeExecFileInput, RuntimeExecResult, RuntimeProcessInput } from '@electron/features/workspace/runtime/types';

function ok(stdout = ''): RuntimeExecResult {
  return { stdout, stderr: '', exitCode: 0 };
}

function fail(): RuntimeExecResult {
  return { stdout: '', stderr: '', exitCode: 1 };
}

function createProcess(pid = 1234, executionPid?: number) {
  return {
    pid,
    executionPid,
    write: vi.fn(),
    signal: vi.fn(),
    onData: vi.fn(() => vi.fn()),
    onExit: vi.fn(() => vi.fn()),
  };
}

describe('HostDevServerManager', () => {
  it('parses listening ports from lsof output', () => {
    expect(parseLsofPort('node 123 user 22u IPv4 TCP 127.0.0.1:5173 (LISTEN)')).toBe(5173);
    expect(parseLsofPort('COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME')).toBeNull();
  });

  it('emits registered and unregistered events for host dev servers', async () => {
    const process = createProcess();
    const manager = new HostDevServerManager({
      workspaceId: 'workspace-a',
      platform: 'darwin',
      spawn: vi.fn(async () => process),
      execFile: vi.fn(async (input) => input.program === 'pgrep'
        ? fail()
        : ok('node 1234 user 22u IPv4 TCP 127.0.0.1:5173 (LISTEN)')),
      pollIntervalMs: 1,
      portDetectTimeoutMs: 10,
    });
    const events: unknown[] = [];
    manager.onChange((event) => events.push(event));

    const server = await manager.start({ command: 'pnpm dev', cwd: '/workspace' });
    await manager.stop({ serverId: server.id });

    expect(events).toEqual([
      expect.objectContaining({
        type: 'registered',
        workspaceId: 'workspace-a',
        serverId: server.id,
        status: 'running',
      }),
      expect.objectContaining({
        type: 'status_changed',
        workspaceId: 'workspace-a',
        serverId: server.id,
        status: 'stopped',
      }),
      expect.objectContaining({
        type: 'unregistered',
        workspaceId: 'workspace-a',
        serverId: server.id,
        status: 'stopped',
      }),
    ]);
  });

  it('starts a host dev server with detected localhost URL', async () => {
    const spawn = vi.fn<(input: RuntimeProcessInput) => Promise<ReturnType<typeof createProcess>>>()
      .mockResolvedValue(createProcess());
    const execFile = vi.fn<(input: RuntimeExecFileInput) => Promise<RuntimeExecResult>>()
      .mockImplementation(async (input) => {
        if (input.program === 'pgrep') return fail();
        return ok('node 1234 user 22u IPv4 TCP 127.0.0.1:5173 (LISTEN)');
      });
    const manager = new HostDevServerManager({
      workspaceId: 'workspace-a',
      platform: 'darwin',
      spawn,
      execFile,
      pollIntervalMs: 1,
      portDetectTimeoutMs: 10,
    });

    const server = await manager.start({ command: 'pnpm dev', cwd: '/workspace' });

    expect(spawn).toHaveBeenCalledWith({ command: 'pnpm dev', cwd: '/workspace', stdio: 'pipe' });
    expect(execFile).toHaveBeenCalledWith(expect.objectContaining({
      program: 'lsof',
      args: ['-nP', '-iTCP', '-sTCP:LISTEN', '-p', '1234'],
    }));
    expect(server).toMatchObject({
      id: 'workspace-a:workspace:root:5173',
      port: 5173,
      url: 'http://127.0.0.1:5173',
      status: 'running',
    });
    expect(manager.list()).toEqual([server]);
  });

  it('uses executionPid for port detection when available', async () => {
    const spawn = vi.fn<(input: RuntimeProcessInput) => Promise<ReturnType<typeof createProcess>>>()
      .mockResolvedValue(createProcess(111, 222));
    const execFile = vi.fn<(input: RuntimeExecFileInput) => Promise<RuntimeExecResult>>()
      .mockImplementation(async (input) => {
        if (input.program === 'pgrep') return fail();
        return ok('node 222 user 22u IPv4 TCP 127.0.0.1:5173 (LISTEN)');
      });
    const manager = new HostDevServerManager({
      workspaceId: 'workspace-a',
      platform: 'linux',
      spawn,
      execFile,
      pollIntervalMs: 1,
      portDetectTimeoutMs: 10,
    });

    await manager.start({ command: 'pnpm dev', cwd: '/workspace' });

    expect(execFile).toHaveBeenCalledWith(expect.objectContaining({
      program: 'lsof',
      args: ['-nP', '-iTCP', '-sTCP:LISTEN', '-p', '222'],
    }));
  });

  it('throws and terminates the spawned process when port detection times out', async () => {
    const process = createProcess();
    const manager = new HostDevServerManager({
      workspaceId: 'workspace-a',
      platform: 'linux',
      spawn: vi.fn(async () => process),
      execFile: vi.fn(async () => fail()),
      pollIntervalMs: 1,
      portDetectTimeoutMs: 2,
    });

    await expect(manager.start({ command: 'pnpm dev', cwd: '/workspace' }))
      .rejects.toThrow('No listening port was detected after starting the command.');

    expect(process.signal).toHaveBeenCalledTimes(1);
    expect(process.signal).toHaveBeenCalledWith('SIGTERM');
    expect(manager.list()).toEqual([]);
  });

});
