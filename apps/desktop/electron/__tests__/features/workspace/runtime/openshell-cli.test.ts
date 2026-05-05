import { EventEmitter } from 'events';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  spawnMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: mocks.execFileMock,
  spawn: mocks.spawnMock,
}));
vi.mock('util', () => ({ promisify: () => mocks.execFileMock }));

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
    mocks.execFileMock.mockResolvedValue({ stdout: 'openshell 0.4.1\n', stderr: '' });

    const result = await checkOpenShellCli();

    expect(result.ok).toBe(true);
    expect(result.version).toBe('openshell 0.4.1');
    expect(result.message).toContain('OpenShell CLI detected');
    expect(mocks.execFileMock).toHaveBeenCalledWith('openshell', ['--version'], {
      timeout: 10_000,
      maxBuffer: 10 * 1024 * 1024,
    });
  });

  it('returns a clear failure when OpenShell CLI is missing', async () => {
    mocks.execFileMock.mockRejectedValue({
      code: 'ENOENT',
      message: 'spawn openshell ENOENT',
    });

    const result = await checkOpenShellCli();

    expect(result.ok).toBe(false);
    expect(result.message).toContain('OpenShell CLI not found');
    expect(result.message).toContain('command not found');
    expect(result.result.exitCode).toBe(1);
  });

  it('distinguishes missing Docker CLI from a stopped daemon', async () => {
    mocks.execFileMock.mockRejectedValueOnce({
      code: 'ENOENT',
      message: 'spawn docker ENOENT',
    });

    const missingCli = await checkDockerDaemon();

    expect(missingCli.name).toBe('docker-cli');
    expect(missingCli.ok).toBe(false);
    expect(missingCli.message).toContain('Docker CLI not found');

    mocks.execFileMock.mockRejectedValueOnce({
      code: 1,
      stdout: '',
      stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock',
    });

    const stoppedDaemon = await checkDockerDaemon();

    expect(stoppedDaemon.name).toBe('docker-daemon');
    expect(stoppedDaemon.ok).toBe(false);
    expect(stoppedDaemon.message).toContain('Docker daemon is not running');
    expect(stoppedDaemon.message).toContain('Cannot connect to the Docker daemon');
  });

  it('returns command output and exit code without throwing for process failures', async () => {
    mocks.execFileMock.mockRejectedValue({
      code: 23,
      stdout: 'partial stdout',
      stderr: 'bad token\0 details',
    });

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

  it('spawns OpenShell with argument arrays for streaming use', () => {
    const child = new EventEmitter() as ChildProcessWithoutNullStreams;
    mocks.spawnMock.mockReturnValue(child);

    const result = spawnOpenShell(['logs', 'sero-ws', '--tail'], { cwd: '/tmp/ws' });

    expect(result).toBe(child);
    expect(mocks.spawnMock).toHaveBeenCalledWith('openshell', ['logs', 'sero-ws', '--tail'], {
      cwd: '/tmp/ws',
      stdio: 'pipe',
    });
  });
});
