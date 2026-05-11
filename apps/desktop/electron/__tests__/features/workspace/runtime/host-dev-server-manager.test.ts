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
      platform: 'win32',
      spawn,
      execFile,
      pollIntervalMs: 1,
      portDetectTimeoutMs: 10,
      tcpProbe: vi.fn(async () => true),
    });

    await manager.start({ command: 'pnpm dev', cwd: '/workspace' });

    expect(execFile).toHaveBeenCalledWith(expect.objectContaining({
      program: 'lsof',
      args: ['-nP', '-iTCP', '-sTCP:LISTEN', '-p', '222'],
    }));
  });

  it('marks a server failed when port detection times out', async () => {
    const manager = new HostDevServerManager({
      workspaceId: 'workspace-a',
      platform: 'linux',
      spawn: vi.fn(async () => createProcess()),
      execFile: vi.fn(async () => fail()),
      pollIntervalMs: 1,
      portDetectTimeoutMs: 2,
    });

    const server = await manager.start({ command: 'pnpm dev', cwd: '/workspace' });

    expect(server).toMatchObject({
      port: 0,
      status: 'failed',
      diagnosticCode: 'dev-server-port-detect-timeout',
    });
    expect(manager.status({ serverId: server.id }).servers[0]).toMatchObject({
      diagnosticCode: 'dev-server-port-detect-timeout',
    });
  });

  it('surfaces Windows WSL localhost-forwarding diagnostics when TCP probe fails', async () => {
    const tcpProbe = vi.fn(async () => false);
    const manager = new HostDevServerManager({
      workspaceId: 'workspace-a',
      platform: 'win32',
      spawn: vi.fn(async () => createProcess()),
      execFile: vi.fn(async (input) => input.program === 'pgrep'
        ? fail()
        : ok('node 1234 user 22u IPv4 TCP 127.0.0.1:3000 (LISTEN)')),
      tcpProbe,
      probeRetryDelayMs: 1,
      pollIntervalMs: 1,
      portDetectTimeoutMs: 10,
    });

    await manager.start({ command: 'pnpm dev', cwd: '/workspace' });
    const preview = await manager.resolvePreviewUrl({ targetPort: 3000 });

    expect(tcpProbe).toHaveBeenCalledTimes(3);
    expect(preview).toMatchObject({
      url: 'http://127.0.0.1:3000',
      diagnosticCode: 'wsl-localhost-forwarding-disabled',
    });
  });

  it('skips the TCP probe outside Windows', async () => {
    const tcpProbe = vi.fn(async () => false);
    const manager = new HostDevServerManager({
      workspaceId: 'workspace-a',
      platform: 'linux',
      spawn: vi.fn(async () => createProcess()),
      execFile: vi.fn(async (input) => input.program === 'pgrep'
        ? fail()
        : ok('node 1234 user 22u IPv4 TCP 127.0.0.1:3000 (LISTEN)')),
      tcpProbe,
      pollIntervalMs: 1,
      portDetectTimeoutMs: 10,
    });

    await manager.start({ command: 'pnpm dev', cwd: '/workspace' });

    expect(tcpProbe).not.toHaveBeenCalled();
  });
});
