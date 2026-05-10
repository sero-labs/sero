import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import type { DoctorResult, DoctorStatus } from '@electron/features/doctor/engine/types';
import { DEFAULT_IMAGE } from '@electron/features/container/core/types';
import { ensureDockerImage } from './docker-image';
import { isDockerCliMissing, runDocker, type DockerRunner } from './docker-cli';

export interface DockerDoctorOptions {
  imageRef?: string;
  run?: DockerRunner;
  now?: () => number;
}

export async function runDockerDoctorChecks(options: DockerDoctorOptions = {}): Promise<DoctorResult[]> {
  const run = options.run ?? runDocker;
  const imageRef = options.imageRef ?? DEFAULT_IMAGE;
  return [
    await checkCli(run, options.now),
    await checkDaemon(run, options.now),
    await checkImage(run, imageRef, options.now),
    await checkBindMount(run, imageRef, options.now),
    await checkPermissions(run, imageRef, options.now),
    await checkNetwork(run, imageRef, options.now),
    await checkPortSmoke(run, imageRef, options.now),
  ];
}

async function checkCli(run: DockerRunner, now?: () => number): Promise<DoctorResult> {
  const start = mark(now);
  const result = await run(['version', '--format', '{{.Client.Version}}'], { timeoutMs: 5_000 });
  if (result.exitCode !== 0) {
    return makeDockerResult('runtime.docker.cli', 'fail', 'Docker CLI is not available.', start, now, {
      stderr: result.stderr,
      missing: isDockerCliMissing(result),
    });
  }
  return makeDockerResult('runtime.docker.cli', 'pass', `Docker CLI ${result.stdout.trim()} is available.`, start, now);
}

async function checkDaemon(run: DockerRunner, now?: () => number): Promise<DoctorResult> {
  const start = mark(now);
  const result = await run(['info', '--format', '{{json .ServerVersion}}'], { timeoutMs: 5_000 });
  if (result.exitCode !== 0) {
    return makeDockerResult('runtime.docker.daemon', 'fail', 'Docker daemon is not reachable.', start, now, { stderr: result.stderr });
  }
  return makeDockerResult('runtime.docker.daemon', 'pass', `Docker daemon ${result.stdout.trim()} is reachable.`, start, now);
}

async function checkImage(run: DockerRunner, imageRef: string, now?: () => number): Promise<DoctorResult> {
  const start = mark(now);
  try {
    const ensured = await ensureDockerImage({ imageRef, run });
    return makeDockerResult('runtime.docker.image', 'pass', `Docker image ${imageRef} is available (${ensured.source}).`, start, now);
  } catch (error) {
    return makeDockerResult('runtime.docker.image', 'fail', `Docker image ${imageRef} is unavailable.`, start, now, { error: errorMessage(error) });
  }
}

async function checkBindMount(run: DockerRunner, imageRef: string, now?: () => number): Promise<DoctorResult> {
  const start = mark(now);
  const dir = await mkdtemp(path.join(tmpdir(), 'sero-docker-mount-'));
  try {
    const result = await run([
      'run', '--rm', '--mount', `type=bind,source=${dir},target=/workspace`, imageRef,
      'sh', '-lc', 'echo ok > /workspace/from-container.txt',
    ], { timeoutMs: 30_000 });
    if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout);
    const content = await readFile(path.join(dir, 'from-container.txt'), 'utf8');
    return makeDockerResult('runtime.docker.bindMount', content.trim() === 'ok' ? 'pass' : 'fail', 'Docker bind mounts are writable from the runtime.', start, now);
  } catch (error) {
    return makeDockerResult('runtime.docker.bindMount', 'fail', 'Docker bind mount smoke test failed.', start, now, { error: errorMessage(error) });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function checkPermissions(run: DockerRunner, imageRef: string, now?: () => number): Promise<DoctorResult> {
  const start = mark(now);
  const dir = await mkdtemp(path.join(tmpdir(), 'sero-docker-perms-'));
  try {
    await writeFile(path.join(dir, 'from-host.txt'), 'host', 'utf8');
    const result = await run([
      'run', '--rm', ...userArgsForSmoke(), '--mount', `type=bind,source=${dir},target=/workspace`, imageRef,
      'sh', '-lc', 'cat /workspace/from-host.txt >/dev/null && echo ok >/workspace/from-container.txt',
    ], { timeoutMs: 30_000 });
    if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout);
    await rm(path.join(dir, 'from-container.txt'), { force: true });
    return makeDockerResult('runtime.docker.permissions', 'pass', 'Docker bind-mounted files are host-editable.', start, now);
  } catch (error) {
    return makeDockerResult('runtime.docker.permissions', 'fail', 'Docker permission smoke test failed.', start, now, { error: errorMessage(error) });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function checkNetwork(run: DockerRunner, imageRef: string, now?: () => number): Promise<DoctorResult> {
  const start = mark(now);
  const result = await run(['run', '--rm', imageRef, 'sh', '-lc', 'curl -fsSL --max-time 10 https://registry.npmjs.org >/dev/null'], { timeoutMs: 20_000 });
  return makeDockerResult(
    'runtime.docker.network',
    result.exitCode === 0 ? 'pass' : 'warn',
    result.exitCode === 0 ? 'Docker runtime network access is working.' : 'Docker runtime network smoke test failed or the host is offline.',
    start,
    now,
    result.exitCode === 0 ? undefined : { stderr: result.stderr },
  );
}

async function checkPortSmoke(run: DockerRunner, imageRef: string, now?: () => number): Promise<DoctorResult> {
  const start = mark(now);
  const name = `sero-doctor-port-${Date.now()}`;
  try {
    const startResult = await run(['run', '-d', '--name', name, '-p', '127.0.0.1::32000', imageRef, 'sh', '-lc', 'python3 -m http.server 32000'], { timeoutMs: 30_000 });
    if (startResult.exitCode !== 0) throw new Error(startResult.stderr || startResult.stdout);
    const inspect = await run(['port', name, '32000/tcp'], { timeoutMs: 5_000 });
    if (inspect.exitCode !== 0) throw new Error(inspect.stderr || inspect.stdout);
    return makeDockerResult('runtime.docker.port', 'pass', 'Docker loopback port publishing works.', start, now, { mapping: inspect.stdout.trim() });
  } catch (error) {
    return makeDockerResult('runtime.docker.port', 'fail', 'Docker loopback port smoke test failed.', start, now, { error: errorMessage(error) });
  } finally {
    await run(['rm', '-f', name], { timeoutMs: 10_000 });
  }
}

function userArgsForSmoke(): string[] {
  if (process.platform === 'win32') return [];
  if (typeof process.getuid !== 'function' || typeof process.getgid !== 'function') return [];
  return ['--user', `${process.getuid()}:${process.getgid()}`, '--env', 'HOME=/tmp/sero-home'];
}

function makeDockerResult(
  id: string,
  status: DoctorStatus,
  message: string,
  start: number,
  now?: () => number,
  details?: Record<string, unknown>,
): DoctorResult {
  return { id, category: 'runtime', status, message, details, durationMs: mark(now) - start };
}

function mark(now?: () => number): number {
  return now ? now() : Date.now();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
