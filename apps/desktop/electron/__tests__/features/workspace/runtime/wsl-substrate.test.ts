import type { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPosixHostSubstrate } from '@electron/features/workspace/runtime/backends/host/posix-substrate';
import {
  createWslHostSubstrate,
  resetWslSubstrateProbeCacheForTests,
} from '@electron/features/workspace/runtime/backends/host/wsl-substrate';

const mocks = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  execFileSyncMock: vi.fn(),
  spawnMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: mocks.execFileMock,
  execFileSync: mocks.execFileSyncMock,
  spawn: mocks.spawnMock,
}));

class MockReadable extends EventEmitter {
  setEncoding = vi.fn();
}

class MockSpawnedProcess extends EventEmitter {
  stdout = new MockReadable();
  stdin = { end: vi.fn() };
  kill = vi.fn();
}

function createSubstrate(options: { supportsCd?: boolean } = {}) {
  return createWslHostSubstrate({
    workspacePath: '\\\\wsl$\\Ubuntu\\home\\me\\repo',
    ...options,
  });
}

function completeExecFileWith(stdout: string): void {
  mocks.execFileMock.mockImplementation((_program: string, _args: string[], callback: (error: Error | null, stdout: string, stderr: string) => void) => {
    callback(null, stdout, '');
  });
}

describe('WslHostSubstrate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWslSubstrateProbeCacheForTests();
    mocks.execFileSyncMock.mockReturnValue('Usage: wsl.exe --cd <Directory>');
  });

  it('renders shell and execFile commands through wsl.exe -d <distro>', () => {
    const substrate = createSubstrate({ supportsCd: true });

    const shell = substrate.shellCommand({ command: 'pnpm dev', cwd: '/home/me/repo' });
    const execFile = substrate.execFileCommand({ program: 'git', args: ['status'], cwd: '/home/me/repo' });

    expect(shell.program).toBe('wsl.exe');
    expect(shell.args.slice(0, 2)).toEqual(['-d', 'Ubuntu']);
    expect(shell.args).toEqual(expect.arrayContaining(['--cd', '/home/me/repo', '--', 'bash', '-c']));
    expect(shell.innerPidFile).toMatch(/^\/tmp\/sero-pid-/);
    expect(execFile.program).toBe('wsl.exe');
    expect(execFile.args.slice(0, 2)).toEqual(['-d', 'Ubuntu']);
    expect(execFile.args).toEqual(['-d', 'Ubuntu', '--cd', '/home/me/repo', '--', 'git', 'status']);
  });

  it('adds caller env keys to WSLENV with unicode markers', () => {
    const substrate = createSubstrate({ supportsCd: true });

    const rendered = substrate.shellCommand({
      command: 'git fetch',
      cwd: '/home/me/repo',
      env: {
        GIT_ASKPASS: '/tmp/askpass.sh',
        GH_TOKEN: 'token',
        GIT_TERMINAL_PROMPT: '0',
      },
    });

    expect(rendered.env).toMatchObject({
      GIT_ASKPASS: '/tmp/askpass.sh',
      GH_TOKEN: 'token',
      GIT_TERMINAL_PROMPT: '0',
    });
    expect(rendered.env?.WSLENV).toContain('GIT_ASKPASS/u');
    expect(rendered.env?.WSLENV).toContain('GH_TOKEN/u');
    expect(rendered.env?.WSLENV).toContain('GIT_TERMINAL_PROMPT/u');
  });

  it('falls back to cd inside bash when the wsl.exe --cd probe is unsupported', () => {
    mocks.execFileSyncMock.mockReturnValue('Usage: wsl.exe');
    const substrate = createSubstrate();

    const rendered = substrate.execFileCommand({ program: 'git', args: ['status', '--short'], cwd: '/home/me/repo with spaces' });

    expect(mocks.execFileSyncMock).toHaveBeenCalledWith('wsl.exe', ['--help'], { encoding: 'utf8' });
    expect(rendered.args.slice(0, 4)).toEqual(['-d', 'Ubuntu', '--', 'bash']);
    expect(rendered.args[4]).toBe('-c');
    expect(rendered.args[5]).toBe("cd '/home/me/repo with spaces' && 'git' 'status' '--short'");
  });

  it('signals the wsl.exe parent then kills the inner pid from the pidfile', async () => {
    vi.useFakeTimers();
    completeExecFileWith('4242\n');
    const substrate = createSubstrate({ supportsCd: true });
    const rendered = substrate.shellCommand({ command: 'sleep 30', cwd: '/home/me/repo' });
    const child = { kill: vi.fn() } as unknown as ChildProcess;

    const signalPromise = substrate.signalChild(child, rendered, 'SIGTERM');
    await vi.advanceTimersByTimeAsync(250);
    await signalPromise;
    vi.useRealTimers();

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(mocks.execFileMock).toHaveBeenNthCalledWith(1, 'wsl.exe', ['-d', 'Ubuntu', '--', 'cat', rendered.innerPidFile], expect.any(Function));
    expect(mocks.execFileMock).toHaveBeenNthCalledWith(2, 'wsl.exe', ['-d', 'Ubuntu', '--', 'kill', '-TERM', '4242'], expect.any(Function));
  });

  it('normalizes buffered CRLF output for WSL while POSIX leaves output unchanged', () => {
    const wsl = createSubstrate({ supportsCd: true });
    const posix = createPosixHostSubstrate();

    expect(wsl.normalizeExecOutput('a\r\nb\r\nc')).toBe('a\nb\nc');
    expect(posix.normalizeExecOutput('a\r\nb\r\nc')).toBe('a\r\nb\r\nc');
  });

  it('watches files with inotifywait and parses typed events', async () => {
    const child = new MockSpawnedProcess();
    mocks.spawnMock.mockReturnValue(child);
    const substrate = createSubstrate({ supportsCd: true });
    const onEvent = vi.fn();

    const watcher = await substrate.watchFiles('/home/me/repo', onEvent);
    child.stdout.emit('data', '/home/me/repo/ MODIFY file.txt\n/home/me/repo/src/ CREATE new.ts\n/home/me/repo/ DELETE old.ts\n/home/me/repo/ MOVED_TO moved.ts\n');
    await watcher.close();

    expect(mocks.spawnMock).toHaveBeenCalledWith('wsl.exe', [
      '-d',
      'Ubuntu',
      '--',
      'inotifywait',
      '-m',
      '-r',
      '-e',
      'modify,create,delete,move',
      '/home/me/repo',
    ]);
    expect(onEvent).toHaveBeenNthCalledWith(1, { kind: 'modify', path: '/home/me/repo/file.txt' });
    expect(onEvent).toHaveBeenNthCalledWith(2, { kind: 'create', path: '/home/me/repo/src/new.ts' });
    expect(onEvent).toHaveBeenNthCalledWith(3, { kind: 'delete', path: '/home/me/repo/old.ts' });
    expect(onEvent).toHaveBeenNthCalledWith(4, { kind: 'move', path: '/home/me/repo/moved.ts' });
    expect(child.kill).toHaveBeenCalled();
  });
});
