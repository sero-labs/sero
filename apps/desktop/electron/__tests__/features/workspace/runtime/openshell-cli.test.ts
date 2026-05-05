import { EventEmitter } from 'events';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: mocks.spawnMock,
}));

import { runOpenShell, spawnOpenShell } from '@electron/features/workspace/runtime/openshell/cli';
import {
  checkDockerDaemon,
  checkOpenShellCli,
} from '@electron/features/workspace/runtime/openshell/health';

describe('OpenShell CLI process helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects a successful OpenShell CLI version', async () => {
    mocks.spawnMock.mockReturnValue(createProcess({ stdout: 'openshell 0.4.1\n' }));

    const result = await checkOpenShellCli();

    expect(result.ok).toBe(true);
    expect(result.version).toBe('openshell 0.4.1');
    expect(result.message).toContain('OpenShell CLI detected');
    expect(mocks.spawnMock).toHaveBeenCalledWith('openshell', ['--version'], {
      cwd: undefined,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  });

  it('uses ignored stdin so OpenShell CLI observes immediate EOF', async () => {
    mocks.spawnMock.mockReturnValue(createProcess({ stdout: 'ok\n' }));

    const result = await runOpenShell(['sandbox', 'exec', '-n', 'sero-ws', '--', 'pwd']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('ok\n');
    expect(mocks.spawnMock).toHaveBeenCalledWith('openshell', [
      'sandbox', 'exec', '-n', 'sero-ws', '--', 'pwd',
    ], { cwd: undefined, stdio: ['ignore', 'pipe', 'pipe'] });
  });

  it('returns a clear failure when OpenShell CLI is missing', async () => {
    mocks.spawnMock.mockReturnValue(createProcess({ error: createSpawnError('spawn openshell ENOENT') }));

    const result = await checkOpenShellCli();

    expect(result.ok).toBe(false);
    expect(result.message).toContain('OpenShell CLI not found');
    expect(result.message).toContain('command not found');
    expect(result.result.exitCode).toBe(1);
  });

  it('distinguishes missing Docker CLI from a stopped daemon', async () => {
    mocks.spawnMock.mockReturnValueOnce(createProcess({ error: createSpawnError('spawn docker ENOENT') }));

    const missingCli = await checkDockerDaemon();

    expect(missingCli.name).toBe('docker-cli');
    expect(missingCli.ok).toBe(false);
    expect(missingCli.message).toContain('Docker CLI not found');

    mocks.spawnMock.mockReturnValueOnce(createProcess({
      code: 1,
      stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock',
    }));

    const stoppedDaemon = await checkDockerDaemon();

    expect(stoppedDaemon.name).toBe('docker-daemon');
    expect(stoppedDaemon.ok).toBe(false);
    expect(stoppedDaemon.message).toContain('Docker daemon is not running');
    expect(stoppedDaemon.message).toContain('Cannot connect to the Docker daemon');
  });

  it('returns command output and exit code without throwing for process failures', async () => {
    mocks.spawnMock.mockReturnValue(createProcess({
      code: 23,
      stdout: 'partial stdout',
      stderr: 'bad token\0 details',
    }));

    const result = await runOpenShell(['sandbox', 'exec', '-n', 'sero-ws']);

    expect(result).toEqual({
      stdout: 'partial stdout',
      stderr:
        'openshell command failed: openshell sandbox exec -n sero-ws (exit code 23).\n' +
        'stderr: bad token details\n' +
        'stdout: partial stdout',
      exitCode: 23,
    });
  });

  it('redacts shell command payloads from process failure diagnostics', async () => {
    mocks.spawnMock.mockReturnValue(createProcess({ code: 1, stderr: 'command failed' }));

    const result = await runOpenShell([
      '--gateway', 'sero-local',
      'sandbox', 'exec', '-n', 'sero-ws',
      '--', 'sh', '-lc', 'echo $SECRET && curl https://token.example',
    ]);

    expect(result.stderr).toContain('sh -lc [redacted shell command]');
    expect(result.stderr).not.toContain('echo $SECRET');
    expect(result.stderr).not.toContain('token.example');
  });

  it('spawns OpenShell with argument arrays for streaming use', () => {
    const child = createProcess();
    mocks.spawnMock.mockReturnValue(child);

    const result = spawnOpenShell(['logs', 'sero-ws', '--tail'], { cwd: '/tmp/ws' });

    expect(result).toBe(child);
    expect(mocks.spawnMock).toHaveBeenCalledWith('openshell', ['logs', 'sero-ws', '--tail'], {
      cwd: '/tmp/ws',
      stdio: 'pipe',
    });
  });
});

interface ProcessFixture {
  code?: number;
  signal?: NodeJS.Signals | null;
  stdout?: string;
  stderr?: string;
  error?: Error & { code?: string };
}

function createProcess(fixture: ProcessFixture = {}): ChildProcessWithoutNullStreams {
  const child = new EventEmitter() as ChildProcessWithoutNullStreams;
  child.stdout = new EventEmitter() as ChildProcessWithoutNullStreams['stdout'];
  child.stderr = new EventEmitter() as ChildProcessWithoutNullStreams['stderr'];
  child.stdin = { end: vi.fn() } as unknown as ChildProcessWithoutNullStreams['stdin'];
  child.kill = vi.fn() as unknown as ChildProcessWithoutNullStreams['kill'];

  queueMicrotask(() => {
    if (fixture.stdout) child.stdout.emit('data', Buffer.from(fixture.stdout));
    if (fixture.stderr) child.stderr.emit('data', Buffer.from(fixture.stderr));
    if (fixture.error) {
      child.emit('error', fixture.error);
      return;
    }
    child.emit('exit', fixture.code ?? 0, fixture.signal ?? null);
  });

  return child;
}

function createSpawnError(message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = 'ENOENT';
  return error;
}
