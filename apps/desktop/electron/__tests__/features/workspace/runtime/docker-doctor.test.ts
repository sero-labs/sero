import { writeFile } from 'fs/promises';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { DockerCommandResult, DockerRunner } from '@electron/features/workspace/runtime/backends/docker/docker-cli';
import { runDockerDoctorChecks, runDockerSmokeChecks } from '@electron/features/workspace/runtime/backends/docker/docker-doctor';

describe('Docker Doctor checks', () => {
  it('runs only bounded CLI, daemon, and local image inspect checks by default', async () => {
    const calls: string[][] = [];
    const run: DockerRunner = vi.fn(async (args: string[]) => {
      calls.push(args);
      if (args[0] === 'version') return fail('ENOENT docker not found', 127);
      if (args[0] === 'info') return fail('Cannot connect to Docker daemon');
      if (args[0] === 'image') return fail('No such image');
      return fail('unexpected docker command');
    });

    const results = await runDockerDoctorChecks({ imageRef: 'missing:image', run, now: clock() });

    expect(results.map((result) => result.id)).toEqual([
      'runtime.docker.cli',
      'runtime.docker.daemon',
      'runtime.docker.image',
    ]);
    expect(calls).toEqual([
      ['version', '--format', '{{.Client.Version}}'],
      ['info', '--format', '{{json .ServerVersion}}'],
      ['image', 'inspect', 'missing:image'],
    ]);
    expect(calls.flat()).not.toContain('pull');
    expect(calls.flat()).not.toContain('build');
    expect(calls.filter((args) => args[0] === 'run')).toHaveLength(0);
    expect(results.find((result) => result.id === 'runtime.docker.cli')).toMatchObject({ status: 'fail' });
    expect(results.find((result) => result.id === 'runtime.docker.daemon')).toMatchObject({ status: 'fail' });
    expect(results.find((result) => result.id === 'runtime.docker.image')).toMatchObject({ status: 'warn' });
  });

  it('threads abort signals into each registered docker check', async () => {
    const controller = new AbortController();
    const signals: (AbortSignal | undefined)[] = [];
    const run: DockerRunner = vi.fn(async (_args, options) => {
      signals.push(options?.signal);
      return ok('25.0.0');
    });

    await runDockerDoctorChecks({ imageRef: 'local:image', run, signal: controller.signal });

    expect(signals).toEqual([controller.signal, controller.signal, controller.signal]);
  });

  it('keeps bind mount, permission, network, and port probes as explicit smoke checks', async () => {
    const run: DockerRunner = vi.fn(async (args: string[]) => {
      const joined = args.join(' ');
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

    const results = await runDockerSmokeChecks({ imageRef: 'local:image', run, now: clock() });

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
