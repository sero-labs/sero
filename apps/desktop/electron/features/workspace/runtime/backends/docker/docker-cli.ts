import { existsSync } from 'fs';
import { delimiter, join } from 'path';
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

export type ContainerEngineKind = 'docker' | 'podman';

export interface DockerCommandResolution {
  executable: string;
  engine: ContainerEngineKind;
  env: NodeJS.ProcessEnv;
}

export type DockerRunner = (args: string[], options?: DockerRunOptions) => Promise<DockerCommandResult>;

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;
const POSIX_FALLBACK_PATHS = ['/usr/local/bin', '/opt/homebrew/bin', '/opt/podman/bin', '/usr/bin', '/bin'];
const MAC_DOCKER_DESKTOP_PATHS = [
  '/Applications/Docker.app/Contents/Resources/bin',
  '/usr/local/share/docker/bin',
];
const WINDOWS_DOCKER_DESKTOP_PATHS = [
  'C:\\Program Files\\Docker\\Docker\\resources\\bin',
  'C:\\Program Files\\Docker\\Docker\\resources',
];
const WINDOWS_PODMAN_PATHS = [
  'C:\\Program Files\\RedHat\\Podman',
];
const ENGINE_PREFERENCE: readonly ContainerEngineKind[] = ['docker', 'podman'];
let cachedImplicitCommand: Pick<DockerCommandResolution, 'executable' | 'engine'> | null = null;

function defaultDockerLookupPaths(): string[] {
  if (process.platform === 'win32') {
    return [...WINDOWS_DOCKER_DESKTOP_PATHS, ...WINDOWS_PODMAN_PATHS];
  }

  return [
    ...POSIX_FALLBACK_PATHS,
    ...MAC_DOCKER_DESKTOP_PATHS.filter((entry) => existsSync(entry)),
  ];
}

export function augmentedDockerPath(basePath = ''): string {
  const entries = [
    ...basePath.split(delimiter).filter(Boolean),
    ...defaultDockerLookupPaths(),
  ];
  return Array.from(new Set(entries)).join(delimiter);
}

function findBinaryOnPath(name: string, path: string): string | null {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  for (const dir of path.split(delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const candidate = join(dir, `${name}${ext}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function normalizeEngine(value: string | undefined): ContainerEngineKind | null {
  if (!value) return null;
  const lowered = value.toLowerCase();
  if (lowered === 'docker' || lowered === 'podman') return lowered;
  return null;
}

function inferEngineFromExecutable(executable: string): ContainerEngineKind {
  return /podman/i.test(executable) ? 'podman' : 'docker';
}

export function resolveDockerCommand(env?: NodeJS.ProcessEnv): DockerCommandResolution {
  const mergedEnv = { ...process.env, ...env };
  const augmentedPath = augmentedDockerPath(mergedEnv.PATH ?? '');
  const explicitBinary = mergedEnv.SERO_DOCKER_BIN || mergedEnv.DOCKER_BIN;
  const preferredEngine = normalizeEngine(mergedEnv.SERO_CONTAINER_ENGINE);

  const resolvedEnv: NodeJS.ProcessEnv = { ...mergedEnv, PATH: augmentedPath };

  if (explicitBinary) {
    return { executable: explicitBinary, engine: inferEngineFromExecutable(explicitBinary), env: resolvedEnv };
  }

  if (!preferredEngine && cachedImplicitCommand && existsSync(cachedImplicitCommand.executable)) {
    return { ...cachedImplicitCommand, env: resolvedEnv };
  }

  const order: ContainerEngineKind[] = preferredEngine
    ? [preferredEngine, ...ENGINE_PREFERENCE.filter((kind) => kind !== preferredEngine)]
    : [...ENGINE_PREFERENCE];

  for (const engine of order) {
    const found = findBinaryOnPath(engine, augmentedPath);
    if (found) return { executable: found, engine, env: resolvedEnv };
  }

  return { executable: preferredEngine ?? 'docker', engine: preferredEngine ?? 'docker', env: resolvedEnv };
}

export async function runDocker(args: string[], options: DockerRunOptions = {}): Promise<DockerCommandResult> {
  if (options.signal?.aborted) return abortResult();

  const command = resolveDockerCommand(options.env);
  const result = await execContainerCommand(command, args, options);
  rememberSuccessfulImplicitCommand(command, options.env, result);
  const fallback = fallbackCommand(command, options.env, result);
  if (!fallback) return result;
  const fallbackResult = await execContainerCommand(fallback, args, options);
  rememberSuccessfulImplicitCommand(fallback, options.env, fallbackResult);
  return fallbackResult;
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

function execContainerCommand(command: DockerCommandResolution, args: string[], options: DockerRunOptions): Promise<DockerCommandResult> {
  if (options.signal?.aborted) return Promise.resolve(abortResult());

  return new Promise((resolve) => {
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

function fallbackCommand(command: DockerCommandResolution, env: NodeJS.ProcessEnv | undefined, result: DockerCommandResult): DockerCommandResolution | null {
  if (command.engine !== 'docker') return null;
  if (hasExplicitDockerSelection(env)) return null;
  if (!isDockerDaemonUnavailable(result)) return null;

  const podman = findBinaryOnPath('podman', command.env.PATH ?? '');
  if (!podman) return null;
  return { executable: podman, engine: 'podman', env: command.env };
}

function hasExplicitDockerSelection(env?: NodeJS.ProcessEnv): boolean {
  const mergedEnv = { ...process.env, ...env };
  return Boolean(mergedEnv.SERO_DOCKER_BIN || mergedEnv.DOCKER_BIN || normalizeEngine(mergedEnv.SERO_CONTAINER_ENGINE) === 'docker');
}

function hasAnyExplicitContainerSelection(env?: NodeJS.ProcessEnv): boolean {
  const mergedEnv = { ...process.env, ...env };
  return Boolean(mergedEnv.SERO_DOCKER_BIN || mergedEnv.DOCKER_BIN || normalizeEngine(mergedEnv.SERO_CONTAINER_ENGINE));
}

function rememberSuccessfulImplicitCommand(command: DockerCommandResolution, env: NodeJS.ProcessEnv | undefined, result: DockerCommandResult): void {
  if (result.exitCode !== 0) return;
  if (hasAnyExplicitContainerSelection(env)) return;
  cachedImplicitCommand = { executable: command.executable, engine: command.engine };
}

function isDockerDaemonUnavailable(result: DockerCommandResult): boolean {
  if (result.exitCode === 0) return false;
  return /cannot connect to the docker daemon|failed to connect to the docker api|is the docker daemon running|docker\.sock|docker_engine|error during connect/i.test(result.stderr);
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
