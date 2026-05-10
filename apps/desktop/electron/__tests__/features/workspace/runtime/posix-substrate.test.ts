import type { ChildProcess } from 'child_process';
import { describe, expect, it, vi } from 'vitest';
import { createPosixHostSubstrate } from '@electron/features/workspace/runtime/backends/host/posix-substrate';

describe('PosixHostSubstrate', () => {
  it('renders non-login shell commands with bash -c', () => {
    const substrate = createPosixHostSubstrate();

    const rendered = substrate.shellCommand({ command: 'echo ok', cwd: '/tmp/workspace' });

    expect(rendered.program).toBe('bash');
    expect(rendered.args).toEqual(['-c', 'echo ok']);
    expect(rendered.nativeCwd).toBe('/tmp/workspace');
  });

  it('renders login shell commands with bash --login -c', () => {
    const substrate = createPosixHostSubstrate();

    const rendered = substrate.shellCommand({ command: 'echo ok', cwd: '/tmp/workspace', loginShell: true });

    expect(rendered.program).toBe('bash');
    expect(rendered.args).toEqual(['--login', '-c', 'echo ok']);
    expect(rendered.nativeCwd).toBe('/tmp/workspace');
  });

  it('renders execFile commands as the direct program and args', () => {
    const substrate = createPosixHostSubstrate();

    const rendered = substrate.execFileCommand({
      program: 'git',
      args: ['status', '--short'],
      cwd: '/tmp/workspace',
      env: { FOO: 'bar' },
    });

    expect(rendered).toEqual({
      program: 'git',
      args: ['status', '--short'],
      nativeCwd: '/tmp/workspace',
      env: { FOO: 'bar' },
    });
  });

  it('signals child processes directly', async () => {
    const substrate = createPosixHostSubstrate();
    const child = { kill: vi.fn() } as unknown as ChildProcess;
    const rendered = substrate.shellCommand({ command: 'sleep 30', cwd: '/tmp/workspace' });

    await substrate.signalChild(child, rendered, 'SIGTERM');

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });
});
