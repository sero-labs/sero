import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { buildHostGitAuthEnv } from '@electron/features/git/worktree/exec';

export interface RunGitOptions {
  timeout?: number;
  maxBuffer?: number;
  allowFailure?: boolean;
  trim?: boolean;
  /** Extra variables for this one command, such as `GIT_INDEX_FILE`. */
  env?: Record<string, string>;
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
  options: { timeout: number; maxBuffer: number; env?: Record<string, string> },
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
  // Trailing only: a leading space is significant in git plumbing output —
  // `status --porcelain` encodes "not staged" as a space in the first column,
  // so a full trim() corrupts the first record (staged flag + first path char).
  return trim ? output.trimEnd() : output;
}

/**
 * Stops git refreshing its own bookkeeping as a side effect of being asked a
 * question.
 *
 * `git status` and `git diff` rewrite `.git/index` to cache the file stats they
 * just gathered. We watch the git directory to notice real changes, so that
 * write looked like one: every refresh triggered another, forever, several a
 * second, for as long as the Git app was open. It also quietly emptied whatever
 * the user had open, because each refresh rebuilds the state file.
 *
 * The flag only suppresses locks git takes *optionally*, for that caching.
 * Commands that genuinely change the repository take their locks regardless, so
 * this is safe everywhere and is what editors do for the same reason.
 */
const NO_OPTIONAL_LOCKS = '--no-optional-locks';

export async function runGitAsync(
  rawArgs: string[],
  cwd: string,
  {
    timeout = 15_000,
    maxBuffer = 10 * 1024 * 1024,
    allowFailure = false,
    trim = true,
    env,
  }: RunGitOptions = {},
): Promise<string> {
  const args = rawArgs[0] === NO_OPTIONAL_LOCKS ? rawArgs : [NO_OPTIONAL_LOCKS, ...rawArgs];

  try {
    if (executionRouter) {
      const routed = await executionRouter(args, cwd, { timeout, maxBuffer, env });
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
      env: { ...process.env, ...authEnv, ...env },
    });

    return normalizeResult(stdout, trim);
  } catch (error) {
    if (allowFailure) return '';
    throw new Error(formatGitError(error, args), {
      cause: error instanceof Error ? error : undefined,
    });
  }
}
