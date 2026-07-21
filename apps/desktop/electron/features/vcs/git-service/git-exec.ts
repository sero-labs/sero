import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { buildHostGitAuthEnv } from '@electron/features/vcs/worktree/exec';

export interface RunGitOptions {
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

/**
 * Optional execution router. The host installs one that routes repos of
 * container/remote workspaces through the workspace runtime backend
 * (GitRunner); everything else — and every environment without a router,
 * e.g. tests — executes directly on the host path. Returns null to fall
 * back to host execution.
 */
export type GitExecutionRouter = (
  args: string[],
  cwd: string,
  options: { timeout: number; maxBuffer: number },
) => Promise<{ stdout: string; stderr: string; exitCode: number } | null>;

let executionRouter: GitExecutionRouter | null = null;

export function setGitExecutionRouter(router: GitExecutionRouter | null): void {
  executionRouter = router;
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
    if (executionRouter) {
      const routed = await executionRouter(args, cwd, { timeout, maxBuffer });
      if (routed) {
        if (routed.exitCode !== 0) {
          const error = new Error(routed.stderr || routed.stdout || `git ${args.join(' ')} failed`);
          Object.assign(error, { stdout: routed.stdout, stderr: routed.stderr });
          throw error;
        }
        return normalizeResult(routed.stdout, trim);
      }
    }

    // Auth env so network-touching commands (fetch/pull/push) share the same
    // auth posture as every other layer.
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
