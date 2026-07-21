/**
 * Path-addressed git/gh execution for the worktree layer.
 *
 * Worktrees are host filesystem paths (not workspaceIds), so they can't route
 * through the workspace runtime backend like the core GitRunner does. This
 * module gives them the same GitHub auth env injection instead: when the user
 * is signed into Sero's GitHub auth, its token wins (gh gives GH_TOKEN env
 * precedence over its own login); when they aren't, behaviour is identical to
 * a plain execFile with ambient credentials.
 *
 * Error semantics deliberately mirror child_process.execFile: throws on
 * non-zero exit with `stderr`/`code` on the error object.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import type { GitHubAuthManager } from '@electron/features/auth/github/auth-manager';
import { buildGitHubAuthEnv } from '@electron/features/vcs/core/git-runner';

const execFileAsync = promisify(execFile);

const SSH_AVAILABILITY_TTL_MS = 60_000;

let githubAuth: GitHubAuthManager | undefined;
let hostSshCache: { available: boolean; expiresAtMs: number } | undefined;

/** Wire Sero's GitHub auth into worktree git/gh execution (app startup). */
export function setWorktreeGitHubAuth(auth: GitHubAuthManager): void {
  githubAuth = auth;
}

export function resetWorktreeExecForTests(): void {
  githubAuth = undefined;
  hostSshCache = undefined;
}

/** Same probe the host runtime substrate uses, cached at host level. */
async function isHostSshAvailable(): Promise<boolean> {
  const nowMs = Date.now();
  if (hostSshCache && hostSshCache.expiresAtMs > nowMs) return hostSshCache.available;

  let available = false;
  try {
    const result = await execFileAsync('ssh', [
      '-T',
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ConnectTimeout=5',
      'git@github.com',
    ], { timeout: 10_000 }).catch((error: unknown) => {
      // ssh -T to github exits non-zero even on success; the auth banner is
      // on stderr of the "failure".
      const e = error as { stderr?: unknown };
      return { stdout: '', stderr: typeof e?.stderr === 'string' ? e.stderr : '' };
    });
    available = result.stderr.includes('successfully authenticated');
  } catch {
    available = false;
  }
  hostSshCache = { available, expiresAtMs: nowMs + SSH_AVAILABILITY_TTL_MS };
  return available;
}

export interface WorktreeExecOptions {
  cwd: string;
  timeout?: number;
  maxBuffer?: number;
}

/**
 * The GitHub auth env for a host-side git/gh spawn (empty when the user is
 * not signed into Sero's GitHub auth). Exported for the git service, which
 * owns its own spawn wrapper but must share the same auth posture.
 */
export async function buildHostGitAuthEnv(program: 'git' | 'gh'): Promise<Record<string, string>> {
  if (!githubAuth?.getToken()) return {};
  const sshWorks = await isHostSshAvailable();
  return buildGitHubAuthEnv(githubAuth, program, sshWorks);
}

async function execWithAuth(
  program: 'git' | 'gh',
  args: string[],
  options: WorktreeExecOptions,
): Promise<{ stdout: string; stderr: string }> {
  const authEnv = await buildHostGitAuthEnv(program);
  const result = await execFileAsync(program, args, {
    ...options,
    env: { ...process.env, ...authEnv },
  });
  return { stdout: result.stdout, stderr: result.stderr };
}

export function execWorktreeGit(
  args: string[],
  options: WorktreeExecOptions,
): Promise<{ stdout: string; stderr: string }> {
  return execWithAuth('git', args, options);
}

export function execWorktreeGh(
  args: string[],
  options: WorktreeExecOptions,
): Promise<{ stdout: string; stderr: string }> {
  return execWithAuth('gh', args, options);
}
