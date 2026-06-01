import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import type { DoctorResult, DoctorStatus } from '@electron/features/doctor/engine/types';
import { DEFAULT_IMAGE } from '@electron/features/container/core/types';
import { isDockerCliMissing, runDocker, type DockerCommandResult, type DockerRunner } from './docker-cli';

export interface DockerDoctorOptions {
  imageRef?: string;
  run?: DockerRunner;
  now?: () => number;
  signal?: AbortSignal;
}

const REGISTERED_CHECK_BUDGET_MS = 2_800;
const REGISTERED_COMMAND_TIMEOUT_MS = 850;

export async function runDockerDoctorChecks(options: DockerDoctorOptions = {}): Promise<DoctorResult[]> {
  const run = options.run ?? runDocker;
  const imageRef = options.imageRef ?? DEFAULT_IMAGE;
  const { signal, cleanup } = createBoundedSignal(options.signal, REGISTERED_CHECK_BUDGET_MS);
  try {
    const checks = [
      () => checkCli(run, options.now, signal),
      () => checkDaemon(run, options.now, signal),
      () => checkImageLocal(run, imageRef, options.now, signal),
    ];
    const runChecks = (index: number, results: DoctorResult[]): Promise<DoctorResult[]> => {
      const check = checks[index];
      if (!check || signal.aborted) return Promise.resolve(results);
      return check().then((result) => {
        results.push(result);
        return runChecks(index + 1, results);
      });
    };
    return await runChecks(0, []);
  } finally {
    cleanup();
  }
}

export async function runDockerSmokeChecks(options: DockerDoctorOptions = {}): Promise<DoctorResult[]> {
  const run = options.run ?? runDocker;
  const imageRef = options.imageRef ?? DEFAULT_IMAGE;
  const checks = [
    () => checkBindMount(run, imageRef, options.now, options.signal),
    () => checkPermissions(run, imageRef, options.now, options.signal),
    () => checkNetwork(run, imageRef, options.now, options.signal),
    () => checkPortSmoke(run, imageRef, options.now, options.signal),
    () => checkSsAvailable(run, imageRef, options.now, options.signal),
  ];
  const runChecks = (index: number, results: DoctorResult[]): Promise<DoctorResult[]> => {
    const check = checks[index];
    if (!check) return Promise.resolve(results);
    return check().then((result) => {
      results.push(result);
      return runChecks(index + 1, results);
    });
  };
  return runChecks(0, []);
}

async function checkCli(run: DockerRunner, now?: () => number, signal?: AbortSignal): Promise<DoctorResult> {
  const start = mark(now);
  const result = await runWithAbort(run, ['version', '--format', '{{.Client.Version}}'], REGISTERED_COMMAND_TIMEOUT_MS, signal);
  if (result.exitCode !== 0) {
    return makeDockerResult('runtime.docker.cli', 'fail', 'Docker CLI is not available.', start, now, {
      stderr: result.stderr,
      missing: isDockerCliMissing(result),
    });
  }
  return makeDockerResult('runtime.docker.cli', 'pass', `Docker CLI ${result.stdout.trim()} is available.`, start, now);
}

async function checkDaemon(run: DockerRunner, now?: () => number, signal?: AbortSignal): Promise<DoctorResult> {
  const start = mark(now);
  const result = await runWithAbort(run, ['info', '--format', '{{json .ServerVersion}}'], REGISTERED_COMMAND_TIMEOUT_MS, signal);
  if (result.exitCode !== 0) {
    return makeDockerResult('runtime.docker.daemon', 'fail', 'Docker daemon is not reachable.', start, now, { stderr: result.stderr });
  }
  return makeDockerResult('runtime.docker.daemon', 'pass', `Docker daemon ${result.stdout.trim()} is reachable.`, start, now);
}

async function checkImageLocal(run: DockerRunner, imageRef: string, now?: () => number, signal?: AbortSignal): Promise<DoctorResult> {
  const start = mark(now);
  const result = await runWithAbort(run, ['image', 'inspect', imageRef], REGISTERED_COMMAND_TIMEOUT_MS, signal);
  if (result.exitCode === 0) {
    return makeDockerResult('runtime.docker.image', 'pass', `Docker image ${imageRef} is available locally.`, start, now);
  }
  return makeDockerResult('runtime.docker.image', 'warn', `Docker image ${imageRef} is not available locally.`, start, now, { stderr: result.stderr });
}

async function checkBindMount(run: DockerRunner, imageRef: string, now?: () => number, signal?: AbortSignal): Promise<DoctorResult> {
  const start = mark(now);
  const dir = await mkdtemp(path.join(tmpdir(), 'sero-docker-mount-'));
  try {
    const result = await run([
      'run', '--rm', '--mount', `type=bind,source=${dir},target=/workspace`, imageRef,
      'sh', '-lc', 'echo ok > /workspace/from-container.txt',
    ], { timeoutMs: 30_000, signal });
    if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout);
    const content = await readFile(path.join(dir, 'from-container.txt'), 'utf8');
    return makeDockerResult('runtime.docker.bindMount', content.trim() === 'ok' ? 'pass' : 'fail', 'Docker bind mounts are writable from the runtime.', start, now);
  } catch (error) {
    return makeDockerResult('runtime.docker.bindMount', 'fail', 'Docker bind mount smoke test failed.', start, now, { error: errorMessage(error) });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function checkPermissions(run: DockerRunner, imageRef: string, now?: () => number, signal?: AbortSignal): Promise<DoctorResult> {
  const start = mark(now);
  const dir = await mkdtemp(path.join(tmpdir(), 'sero-docker-perms-'));
  try {
    await writeFile(path.join(dir, 'from-host.txt'), 'host', 'utf8');
    const result = await run([
      'run', '--rm', ...userArgsForSmoke(), '--mount', `type=bind,source=${dir},target=/workspace`, imageRef,
      'sh', '-lc', 'cat /workspace/from-host.txt >/dev/null && echo ok >/workspace/from-container.txt',
    ], { timeoutMs: 30_000, signal });
    if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout);
    await rm(path.join(dir, 'from-container.txt'), { force: true });
    return makeDockerResult('runtime.docker.permissions', 'pass', 'Docker bind-mounted files are host-editable.', start, now);
  } catch (error) {
    return makeDockerResult('runtime.docker.permissions', 'fail', 'Docker permission smoke test failed.', start, now, { error: errorMessage(error) });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function checkNetwork(run: DockerRunner, imageRef: string, now?: () => number, signal?: AbortSignal): Promise<DoctorResult> {
  const start = mark(now);
  const result = await run(['run', '--rm', imageRef, 'sh', '-lc', 'curl -fsSL --max-time 10 https://registry.npmjs.org >/dev/null'], { timeoutMs: 20_000, signal });
  return makeDockerResult(
    'runtime.docker.network',
    result.exitCode === 0 ? 'pass' : 'warn',
    result.exitCode === 0 ? 'Docker runtime network access is working.' : 'Docker runtime network smoke test failed or the host is offline.',
    start,
    now,
    result.exitCode === 0 ? undefined : { stderr: result.stderr },
  );
}

async function checkSsAvailable(run: DockerRunner, imageRef: string, now?: () => number, signal?: AbortSignal): Promise<DoctorResult> {
  const start = mark(now);
  // Dev-server port discovery and the docker-backend killPort helper both rely on `ss -tlnp`,
  // which lives in iproute2. Verify the runtime image ships it so dev servers don't silently
  // skip detection inside busybox-only images.
  const result = await run(['run', '--rm', imageRef, 'sh', '-lc', 'command -v ss >/dev/null 2>&1'], { timeoutMs: 15_000, signal });
  if (result.exitCode === 0) {
    return makeDockerResult('runtime.docker.ss', 'pass', 'Runtime image provides ss for dev-server port discovery.', start, now);
  }
  return makeDockerResult(
    'runtime.docker.ss',
    'warn',
    'Runtime image does not provide `ss`; dev-server port detection and killPort may degrade.',
    start,
    now,
    {
      stderr: result.stderr,
      remediation: 'Install iproute2 (Debian/Ubuntu) or equivalent in the runtime image so `ss` is on PATH.',
    },
  );
}

async function checkPortSmoke(run: DockerRunner, imageRef: string, now?: () => number, signal?: AbortSignal): Promise<DoctorResult> {
  const start = mark(now);
  const name = `sero-doctor-port-${Date.now()}`;
  try {
    const startResult = await run(['run', '-d', '--name', name, '-p', '127.0.0.1::32000', imageRef, 'sh', '-lc', 'python3 -m http.server 32000'], { timeoutMs: 30_000, signal });
    if (startResult.exitCode !== 0) throw new Error(startResult.stderr || startResult.stdout);
    const inspect = await run(['port', name, '32000/tcp'], { timeoutMs: 5_000, signal });
    if (inspect.exitCode !== 0) throw new Error(inspect.stderr || inspect.stdout);
    return makeDockerResult('runtime.docker.port', 'pass', 'Docker loopback port publishing works.', start, now, { mapping: inspect.stdout.trim() });
  } catch (error) {
    return makeDockerResult('runtime.docker.port', 'fail', 'Docker loopback port smoke test failed.', start, now, { error: errorMessage(error) });
  } finally {
    await run(['rm', '-f', name], { timeoutMs: 10_000, signal });
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

async function runWithAbort(
  run: DockerRunner,
  args: string[],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<DockerCommandResult> {
  const command = run(args, { timeoutMs, signal });
  if (!signal) return command;
  if (signal.aborted) return failDockerRun('Command aborted.', 130);
  return Promise.race([
    command,
    new Promise<DockerCommandResult>((resolve) => {
      signal.addEventListener('abort', () => resolve(failDockerRun('Command aborted.', 130)), { once: true });
    }),
  ]);
}

function failDockerRun(stderr: string, exitCode: number): DockerCommandResult {
  return { exitCode, stdout: '', stderr };
}

function createBoundedSignal(parentSignal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parentSignal?.aborted) abort();
  else parentSignal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', abort);
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
