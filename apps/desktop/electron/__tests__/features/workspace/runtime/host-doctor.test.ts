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
      'runtime.host.port-discovery',
      'runtime.host.shell',
    ]);
    expect(results.find((result) => result.id === 'runtime.host.bash')).toMatchObject({ status: 'fail' });
    expect(results.find((result) => result.id === 'runtime.host.shell')).toMatchObject({ status: 'fail' });
  });

  it('reports POSIX missing pgrep and port-discovery failures with remediation details', async () => {
    const run: HostDoctorRunner = vi.fn(async (_program: string, args: string[]) => {
      if (args.includes('command -v pgrep')) return fail('pgrep: command not found', 127);
      if (args.includes('command -v lsof || command -v ss || command -v netstat')) return fail('port tools not found', 127);
      return ok('ok');
    });

    const results = await runHostDoctorChecks({ platform: 'linux', run, now: clock() });

    expect(results.find((result) => result.id === 'runtime.host.pgrep')).toMatchObject({
      status: 'fail',
      details: { args: ['-lc', 'command -v pgrep'], remediation: expect.stringContaining('procps') },
    });
    expect(results.find((result) => result.id === 'runtime.host.port-discovery')).toMatchObject({
      status: 'fail',
      details: {
        args: ['-lc', 'command -v lsof || command -v ss || command -v netstat'],
        remediation: expect.stringContaining('iproute2'),
      },
    });
  });

  it('rejects host doctor checks on Windows because host runtime is unsupported there', async () => {
    await expect(runHostDoctorChecks({ platform: 'win32' }))
      .rejects.toThrow(/Host runtime is not supported on Windows/);
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
