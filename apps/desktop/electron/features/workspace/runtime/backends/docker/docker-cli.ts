import { existsSync } from 'fs';
import { execFile, spawn, type ChildProcess } from 'child_process';

export interface DockerCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface DockerRunOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
  signal?: AbortSignal;
}

export interface DockerCommandResolution {
  executable: string;
  env: NodeJS.ProcessEnv;
}

export type DockerRunner = (args: string[], options?: DockerRunOptions) => Promise<DockerCommandResult>;

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;
const FALLBACK_PATHS = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin'];
const DOCKER_DESKTOP_PATHS = [
  '/Applications/Docker.app/Contents/Resources/bin',
  '/usr/local/share/docker/bin',
];

export function augmentedDockerPath(basePath = ''): string {
  const entries = [
    ...basePath.split(':').filter(Boolean),
    ...FALLBACK_PATHS,
    ...DOCKER_DESKTOP_PATHS.filter((entry) => existsSync(entry)),
  ];
  return Array.from(new Set(entries)).join(':');
}

export function resolveDockerCommand(env?: NodeJS.ProcessEnv): DockerCommandResolution {
  const mergedEnv = { ...process.env, ...env };
  return {
    executable: mergedEnv.SERO_DOCKER_BIN || mergedEnv.DOCKER_BIN || 'docker',
    env: {
      ...mergedEnv,
      PATH: augmentedDockerPath(mergedEnv.PATH ?? ''),
    },
  };
}

export function runDocker(args: string[], options: DockerRunOptions = {}): Promise<DockerCommandResult> {
  if (options.signal?.aborted) return Promise.resolve(abortResult());

  return new Promise((resolve) => {
    const command = resolveDockerCommand(options.env);
    execFile(command.executable, args, {
      cwd: options.cwd,
      env: command.env,
      signal: options.signal,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
    }, (error, stdout, stderr) => {
      if (!error) {
        resolve({ stdout, stderr, exitCode: 0 });
        return;
      }
      if (isAbortError(error) || options.signal?.aborted) {
        resolve(abortResult(stdout));
        return;
      }
      const failure = error as NodeJS.ErrnoException & { code?: unknown; killed?: boolean };
      const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      resolve({
        stdout,
        stderr: failure.killed
          ? `Command timed out after ${Math.round(timeoutMs / 1000)}s. ${stderr}`.trim()
          : stderr || failure.message,
        exitCode: failure.killed ? 124 : (typeof failure.code === 'number' ? failure.code : 1),
      });
    });
  });
}

export async function checkDocker(args: string[], options?: DockerRunOptions): Promise<DockerCommandResult> {
  const result = await runDocker(args, options);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || `docker ${args[0] ?? ''} failed`);
  }
  return result;
}

export function spawnDocker(args: string[], options: DockerRunOptions = {}): ChildProcess {
  const command = resolveDockerCommand(options.env);
  return spawn(command.executable, args, {
    cwd: options.cwd,
    env: command.env,
    signal: options.signal,
    stdio: 'pipe',
  });
}

export function isDockerCliMissing(result: DockerCommandResult): boolean {
  return result.exitCode === 127 || /ENOENT|not found|no such file/i.test(result.stderr);
}

function abortResult(stdout = ''): DockerCommandResult {
  return { stdout, stderr: 'Command aborted.', exitCode: 130 };
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' || (error as NodeJS.ErrnoException).code === 'ABORT_ERR';
}
