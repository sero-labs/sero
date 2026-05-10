import { writeFile } from 'fs/promises';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { DockerCommandResult, DockerRunner } from '@electron/features/workspace/runtime/backends/docker/docker-cli';
import { runDockerDoctorChecks } from '@electron/features/workspace/runtime/backends/docker/docker-doctor';

describe('Docker Doctor checks', () => {
  it('returns expected failure shapes for missing CLI and stopped daemon/image failures', async () => {
    const run: DockerRunner = vi.fn(async (args: string[]) => {
      if (args[0] === 'version') return fail('ENOENT docker not found', 127);
      if (args[0] === 'info') return fail('Cannot connect to Docker daemon');
      if (args[0] === 'image') return fail('No such image');
      if (args[0] === 'pull') return fail('offline');
      if (args[0] === 'build') return fail('bad build');
      return fail('docker unavailable');
    });

    const results = await runDockerDoctorChecks({ imageRef: 'missing:image', run, now: clock() });

    expect(results.map((result) => result.id)).toEqual([
      'runtime.docker.cli',
      'runtime.docker.daemon',
      'runtime.docker.image',
      'runtime.docker.bindMount',
      'runtime.docker.permissions',
      'runtime.docker.network',
      'runtime.docker.port',
    ]);
    expect(results.find((result) => result.id === 'runtime.docker.cli')).toMatchObject({ status: 'fail' });
    expect(results.find((result) => result.id === 'runtime.docker.daemon')).toMatchObject({ status: 'fail' });
    expect(results.find((result) => result.id === 'runtime.docker.image')).toMatchObject({ status: 'fail' });
  });

  it('returns pass/warn shapes for bind mount, permission, network, and port smoke checks', async () => {
    const run: DockerRunner = vi.fn(async (args: string[]) => {
      const joined = args.join(' ');
      if (args[0] === 'version') return ok('25.0.0');
      if (args[0] === 'info') return ok('"25.0.0"');
      if (args[0] === 'image') return ok('[]');
      if (joined.includes('from-container.txt')) {
        const mount = args.find((arg) => arg.startsWith('type=bind,source='));
        const source = mount?.match(/source=([^,]+)/)?.[1];
        if (source) await writeFile(path.join(source, 'from-container.txt'), 'ok\n');
        return ok();
      }
      if (joined.includes('registry.npmjs.org')) return fail('offline');
      if (args[0] === 'run' && args.includes('-p')) return ok('port-container');
      if (args[0] === 'port') return ok('127.0.0.1:49153\n');
      return ok();
    });

    const results = await runDockerDoctorChecks({ imageRef: 'local:image', run, now: clock() });

    expect(results.find((result) => result.id === 'runtime.docker.bindMount')).toMatchObject({ status: 'pass' });
    expect(results.find((result) => result.id === 'runtime.docker.permissions')).toMatchObject({ status: 'pass' });
    expect(results.find((result) => result.id === 'runtime.docker.network')).toMatchObject({ status: 'warn' });
    expect(results.find((result) => result.id === 'runtime.docker.port')).toMatchObject({
      status: 'pass',
      details: { mapping: '127.0.0.1:49153' },
    });
  });
});

function ok(stdout = ''): DockerCommandResult {
  return { stdout, stderr: '', exitCode: 0 };
}

function fail(stderr = 'failed', exitCode = 1): DockerCommandResult {
  return { stdout: '', stderr, exitCode };
}

function clock(): () => number {
  let value = 1000;
  return () => {
    value += 10;
    return value;
  };
}
