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
}

export type DockerRunner = (args: string[], options?: DockerRunOptions) => Promise<DockerCommandResult>;

export function runDocker(args: string[], options: DockerRunOptions = {}): Promise<DockerCommandResult> {
  return new Promise((resolve) => {
    execFile('docker', args, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeoutMs ?? 120_000,
      maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (!error) {
        resolve({ stdout, stderr, exitCode: 0 });
        return;
      }
      const failure = error as NodeJS.ErrnoException & { code?: unknown; killed?: boolean };
      resolve({
        stdout,
        stderr: failure.killed
          ? `Command timed out after ${Math.round((options.timeoutMs ?? 120_000) / 1000)}s. ${stderr}`.trim()
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
  return spawn('docker', args, {
    cwd: options.cwd,
    env: options.env,
    stdio: 'pipe',
  });
}

export function isDockerCliMissing(result: DockerCommandResult): boolean {
  return result.exitCode === 127 || /ENOENT|not found|no such file/i.test(result.stderr);
}
