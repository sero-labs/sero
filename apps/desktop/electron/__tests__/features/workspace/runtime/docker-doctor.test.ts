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

  it('threads abortable signals into each registered docker check', async () => {
    const controller = new AbortController();
    const signals: (AbortSignal | undefined)[] = [];
    const run: DockerRunner = vi.fn(async (_args, options) => {
      signals.push(options?.signal);
      expect(options?.timeoutMs).toBeLessThan(1_000);
      return ok('25.0.0');
    });

    await runDockerDoctorChecks({ imageRef: 'local:image', run, signal: controller.signal });

    expect(signals).toHaveLength(3);
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
  });

  it('aborts within its local budget and does not start later registered probes', async () => {
    vi.useFakeTimers();
    const run: DockerRunner = vi.fn((_args, options) => new Promise<DockerCommandResult>((resolve) => {
      options?.signal?.addEventListener('abort', () => resolve(fail('Command aborted.', 130)), { once: true });
    }));

    const pending = runDockerDoctorChecks({ imageRef: 'local:image', run });
    await vi.advanceTimersByTimeAsync(2_800);
    const results = await pending;
    vi.useRealTimers();

    expect(run).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: 'runtime.docker.cli', status: 'fail' });
  });

  it('keeps bind mount, permission, network, port, and ss probes as explicit smoke checks', async () => {
    const run: DockerRunner = vi.fn(async (args: string[]) => {
      const joined = args.join(' ');
      if (joined.includes('from-container.txt')) {
        const mount = args.find((arg) => arg.startsWith('type=bind,source='));
        const source = mount?.match(/source=([^,]+)/)?.[1];
        if (source) await writeFile(path.join(source, 'from-container.txt'), 'ok\n');
        return ok();
      }
      if (joined.includes('registry.npmjs.org')) return fail('offline');
      if (joined.includes('command -v ss')) return ok();
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
    expect(results.find((result) => result.id === 'runtime.docker.ss')).toMatchObject({ status: 'pass' });
  });

  it('warns when the runtime image is missing ss', async () => {
    const run: DockerRunner = vi.fn(async (args: string[]) => {
      const joined = args.join(' ');
      if (joined.includes('command -v ss')) return fail('ss not found', 1);
      if (joined.includes('from-container.txt')) {
        const mount = args.find((arg) => arg.startsWith('type=bind,source='));
        const source = mount?.match(/source=([^,]+)/)?.[1];
        if (source) await writeFile(path.join(source, 'from-container.txt'), 'ok\n');
        return ok();
      }
      if (joined.includes('registry.npmjs.org')) return ok();
      if (args[0] === 'port') return ok('127.0.0.1:49153\n');
      return ok();
    });

    const results = await runDockerSmokeChecks({ imageRef: 'local:image', run, now: clock() });

    expect(results.find((result) => result.id === 'runtime.docker.ss')).toMatchObject({
      status: 'warn',
      message: expect.stringContaining('ss'),
      details: { remediation: expect.stringContaining('iproute2') },
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
