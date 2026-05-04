import type { IPty } from 'node-pty';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerminalManager } from '@electron/features/container/terminal';

const mocks = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));

vi.mock('child_process', () => ({ execFile: mocks.execFileMock }));
vi.mock('util', () => ({ promisify: () => mocks.execFileMock }));

import { createHostRuntimeAdapter } from '@electron/features/workspace/runtime/adapters/host-runtime-adapter';

describe('createHostRuntimeAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes shell commands with host command semantics', async () => {
    mocks.execFileMock.mockResolvedValue({ stdout: 'ok\n', stderr: '' });
    const adapter = createHostRuntimeAdapter({
      workspaceId: 'ws-1',
      workspacePath: '/tmp/ws',
      terminals: createTerminalManagerMock(),
    });

    const result = await adapter.exec('pwd', { cwd: '/tmp/ws', timeoutMs: 5000 });

    expect(result).toEqual({ stdout: 'ok\n', stderr: '', exitCode: 0 });
    expect(mocks.execFileMock).toHaveBeenCalledWith('sh', ['-c', 'pwd'], {
      cwd: '/tmp/ws',
      timeout: 5000,
      maxBuffer: 10 * 1024 * 1024,
    });
  });

  it('normalizes failed execFile errors to ExecResult', async () => {
    mocks.execFileMock.mockRejectedValue({ code: 7, stdout: 'partial', stderr: 'failed' });
    const adapter = createHostRuntimeAdapter({
      workspaceId: 'ws-1',
      workspacePath: '/tmp/ws',
      terminals: createTerminalManagerMock(),
    });

    const result = await adapter.exec('exit 7', { cwd: '/tmp/ws' });

    expect(result).toEqual({ stdout: 'partial', stderr: 'failed', exitCode: 7 });
  });

  it('uses an exit code of 1 and message fallback for nonstandard failures', async () => {
    mocks.execFileMock.mockRejectedValue({ message: 'spawn failed' });
    const adapter = createHostRuntimeAdapter({
      workspaceId: 'ws-1',
      workspacePath: '/tmp/ws',
      terminals: createTerminalManagerMock(),
    });

    const result = await adapter.exec('pwd', { cwd: '/tmp/ws' });

    expect(result).toEqual({ stdout: '', stderr: 'spawn failed', exitCode: 1 });
  });

  it('delegates terminal creation to TerminalManager.createHostTerminal', async () => {
    const pty = createPtyMock();
    const createHostTerminal = vi.fn(() => pty);
    const adapter = createHostRuntimeAdapter({
      workspaceId: 'ws-1',
      workspacePath: '/tmp/ws',
      terminals: { createHostTerminal } as unknown as TerminalManager,
    });

    const result = await adapter.createTerminal({ terminalId: 'term-1', cols: 120, rows: 32 });

    expect(createHostTerminal).toHaveBeenCalledWith('ws-1', 'term-1', '/tmp/ws', 120, 32);
    expect(result).toEqual({ pty, runtime: 'host' });
  });

  it('reports ready host health and capabilities', async () => {
    const adapter = createHostRuntimeAdapter({
      workspaceId: 'ws-1',
      workspacePath: '/tmp/ws',
      terminals: createTerminalManagerMock(),
    });

    await expect(adapter.health()).resolves.toEqual({ providerId: 'host', status: 'ready' });
    expect(adapter.providerId).toBe('host');
    expect(adapter.actualRuntime).toBe('host');
    expect(adapter.capabilities.exec).toBe(true);
    expect(adapter.capabilities.interactiveTerminal).toBe(true);
  });
});

function createTerminalManagerMock(): TerminalManager {
  return { createHostTerminal: vi.fn(() => createPtyMock()) } as unknown as TerminalManager;
}

function createPtyMock(): IPty {
  return { pid: 123 } as unknown as IPty;
}
