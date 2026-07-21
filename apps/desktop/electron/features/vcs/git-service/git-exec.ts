import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

import { buildHostGitAuthEnv } from '@electron/features/vcs/worktree/exec';

interface RunGitOptions {
  timeout?: number;
  maxBuffer?: number;
  allowFailure?: boolean;
  trim?: boolean;
}

interface ExecErrorLike {
  stderr?: string | Buffer;
  stdout?: string | Buffer;
  message?: string;
}

const execFileAsync = promisify(execFile);

function normalizeOutput(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Buffer.isBuffer(value)) return value.toString('utf8').trim();
  return '';
}

function formatGitError(error: unknown, args: string[]): string {
  const execError = error as ExecErrorLike | undefined;
  const stderr = normalizeOutput(execError?.stderr);
  if (stderr) return stderr.split(/\r?\n/).find((line) => line.trim().length > 0) ?? stderr;

  const stdout = normalizeOutput(execError?.stdout);
  if (stdout) return stdout.split(/\r?\n/).find((line) => line.trim().length > 0) ?? stdout;

  if (error instanceof Error && error.message) return error.message;
  return `git ${args.join(' ')} failed`;
}

function normalizeResult(output: string, trim: boolean): string {
  return trim ? output.trim() : output;
}

export function runGit(
  args: string[],
  cwd: string,
  {
    timeout = 15_000,
    maxBuffer = 10 * 1024 * 1024,
    allowFailure = false,
    trim = true,
  }: RunGitOptions = {},
): string {
  try {
    const output = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout,
      maxBuffer,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    return normalizeResult(output, trim);
  } catch (error) {
    if (allowFailure) return '';
    throw new Error(formatGitError(error, args), {
      cause: error instanceof Error ? error : undefined,
    });
  }
}

export async function runGitAsync(
  args: string[],
  cwd: string,
  {
    timeout = 15_000,
    maxBuffer = 10 * 1024 * 1024,
    allowFailure = false,
    trim = true,
  }: RunGitOptions = {},
): Promise<string> {
  try {
    // Network-touching actions (fetch/pull/push) run through here — inject
    // Sero's GitHub auth so they share the auth posture of every other layer.
    const authEnv = await buildHostGitAuthEnv('git');
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout,
      maxBuffer,
      env: { ...process.env, ...authEnv },
    });

    return normalizeResult(stdout, trim);
  } catch (error) {
    if (allowFailure) return '';
    throw new Error(formatGitError(error, args), {
      cause: error instanceof Error ? error : undefined,
    });
  }
}
