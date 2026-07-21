/**
 * GhInvoker — the one seam GitHub operations run through.
 *
 * GitHub ops are needed from two addressing modes: a workspaceId (routed
 * through the runtime backend via GitRunner) and a raw repo path (worktrees,
 * via the worktree exec module). Both factories yield the same throwing
 * contract — resolve {stdout, stderr} on success, throw an Error carrying
 * `stderr`/`stdout` on failure — so each GitHub operation is implemented
 * exactly once over an invoker.
 */

import type { GitRunner } from '@electron/features/git/core/git-runner';
import { execWorktreeGh } from '@electron/features/git/worktree/exec';

export interface GhOutput {
  stdout: string;
  stderr: string;
}

export type GhInvoker = (args: string[], timeoutMs?: number) => Promise<GhOutput>;

/** gh executed in a workspace's runtime (container-aware, auth-injected). */
export function ghForWorkspace(runner: GitRunner, workspaceId: string): GhInvoker {
  return async (args, timeoutMs = 30_000) => {
    const result = await runner.runCommand(workspaceId, 'gh', args, timeoutMs);
    if (result.exitCode !== 0) {
      const error = new Error(result.stderr || result.stdout || `gh ${args[0] ?? ''} failed`);
      Object.assign(error, { stdout: result.stdout, stderr: result.stderr });
      throw error;
    }
    return { stdout: result.stdout, stderr: result.stderr };
  };
}

/** gh executed at a raw repo path (worktrees), with the same auth injection. */
export function ghForPath(repoPath: string): GhInvoker {
  return (args, timeoutMs = 30_000) =>
    execWorktreeGh(args, { cwd: repoPath, timeout: timeoutMs });
}
