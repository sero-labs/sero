import { describe, expect, it, vi } from 'vitest';
import { runHostDoctorChecks, type HostDoctorRunner } from '@electron/features/workspace/runtime/backends/host/host-doctor';

describe('Host Doctor checks', () => {
  it('reports POSIX missing bash failure', async () => {
    const run: HostDoctorRunner = vi.fn(async (program: string) => {
      if (program === 'bash') return fail('bash: command not found', 127);
      return ok('git version 2.0.0');
    });

    const results = await runHostDoctorChecks({ platform: 'linux', run, now: clock() });

    expect(results.map((result) => result.id)).toEqual([
      'runtime.host.bash',
      'runtime.host.git',
      'runtime.host.pgrep',
      'runtime.host.lsof',
      'runtime.host.shell',
    ]);
    expect(results.find((result) => result.id === 'runtime.host.bash')).toMatchObject({ status: 'fail' });
    expect(results.find((result) => result.id === 'runtime.host.shell')).toMatchObject({ status: 'fail' });
  });

  it('reports POSIX missing pgrep and lsof failures with remediation details', async () => {
    const run: HostDoctorRunner = vi.fn(async (_program: string, args: string[]) => {
      if (args.includes('command -v pgrep')) return fail('pgrep: command not found', 127);
      if (args.includes('command -v lsof')) return fail('lsof: command not found', 127);
      return ok('ok');
    });

    const results = await runHostDoctorChecks({ platform: 'linux', run, now: clock() });

    expect(results.find((result) => result.id === 'runtime.host.pgrep')).toMatchObject({
      status: 'fail',
      details: { args: ['-lc', 'command -v pgrep'], remediation: expect.stringContaining('procps') },
    });
    expect(results.find((result) => result.id === 'runtime.host.lsof')).toMatchObject({
      status: 'fail',
      details: { args: ['-lc', 'command -v lsof'], remediation: expect.stringContaining('lsof') },
    });
  });

  it('checks Windows wsl.exe status, distro echo, bash, pgrep, lsof, and inotifywait availability', async () => {
    const run: HostDoctorRunner = vi.fn(async () => ok('ok'));

    const results = await runHostDoctorChecks({
      platform: 'win32',
      workspacePath: '\\\\wsl$\\Ubuntu\\home\\me\\repo',
      run,
      now: clock(),
    });

    expect(results.every((result) => result.status === 'pass')).toBe(true);
    expect(run).toHaveBeenNthCalledWith(1, 'wsl.exe', ['--version'], { timeoutMs: 5_000 });
    expect(run).toHaveBeenNthCalledWith(2, 'wsl.exe', ['--status'], { timeoutMs: 5_000 });
    expect(run).toHaveBeenNthCalledWith(3, 'wsl.exe', ['-d', 'Ubuntu', '--', 'echo', 'ok'], { timeoutMs: 5_000 });
    expect(run).toHaveBeenNthCalledWith(4, 'wsl.exe', ['-d', 'Ubuntu', '--', 'which', 'bash'], { timeoutMs: 5_000 });
    expect(run).toHaveBeenNthCalledWith(5, 'wsl.exe', ['-d', 'Ubuntu', '--', 'which', 'pgrep'], { timeoutMs: 5_000 });
    expect(run).toHaveBeenNthCalledWith(6, 'wsl.exe', ['-d', 'Ubuntu', '--', 'which', 'lsof'], { timeoutMs: 5_000 });
    expect(run).toHaveBeenNthCalledWith(7, 'wsl.exe', ['-d', 'Ubuntu', '--', 'which', 'inotifywait'], { timeoutMs: 5_000 });
  });

  it('warns when WSL inotifywait is missing', async () => {
    const run: HostDoctorRunner = vi.fn(async (_program: string, args: string[]) => {
      if (args.includes('inotifywait')) return fail('inotifywait not found', 127);
      return ok('ok');
    });

    const results = await runHostDoctorChecks({ platform: 'win32', run, now: clock() });

    expect(results.find((result) => result.id === 'runtime.host.wslInotifywait')).toMatchObject({
      status: 'warn',
      details: { remediation: expect.stringContaining('inotify-tools') },
    });
  });

  it('reports Windows missing wsl.exe failure', async () => {
    const run: HostDoctorRunner = vi.fn(async (program: string) => {
      if (program === 'wsl.exe') return fail('ENOENT wsl.exe not found', 127);
      return ok();
    });

    const results = await runHostDoctorChecks({ platform: 'win32', run, now: clock() });

    expect(results.find((result) => result.id === 'runtime.host.wsl')).toMatchObject({
      status: 'fail',
      details: { program: 'wsl.exe' },
    });
  });
});

function ok(stdout = '') {
  return { stdout, stderr: '', exitCode: 0 };
}

function fail(stderr = 'failed', exitCode = 1) {
  return { stdout: '', stderr, exitCode };
}

function clock(): () => number {
  let value = 1000;
  return () => {
    value += 10;
    return value;
  };
}
