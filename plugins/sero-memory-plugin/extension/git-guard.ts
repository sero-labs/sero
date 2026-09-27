/**
 * Keeps workspace memory out of Git (design D8).
 *
 * On the first workspace-memory write in each app run the plugin checks that
 * the workspace is a repository, makes sure the `.sero/` exclude rule exists,
 * and asks Git whether it tracks any file in the memory folder. Only a
 * definitive answer ("safe" or "tracked") is stored, for the rest of the app
 * run. Any failure refuses the write and stores nothing, so the next write
 * checks again (fail closed).
 */

import { execFile } from 'node:child_process';
import path from 'node:path';

import { ensureGitStateIgnored } from '@sero-ai/extension-runtime';

import { workspaceMemoryDir } from './entry-store';
import { memoryRegistry } from './registry';

export interface GitRun {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs git and reports the exit code. `code` is -1 when git could not start. */
export type GitRunner = (args: string[], cwd: string) => Promise<GitRun>;

export const runGit: GitRunner = (args, cwd) => new Promise((resolve) => {
  execFile('git', args, { cwd, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }, (error, stdout, stderr) => {
    const code = error ? (typeof error.code === 'number' ? error.code : -1) : 0;
    resolve({ code, stdout: String(stdout), stderr: String(stderr) });
  });
});

export type GitGuardResult = { ok: true } | { ok: false; reason: string };

const TRACKED_REASON = 'Git tracks files in this workspace\'s memory folder (.sero/apps/memory/), so workspace memory would be committed. Workspace memory is off for this app run. Untrack the folder with `git rm -r --cached .sero/apps/memory`, or save the memory with global scope.';

function failed(detail: string): GitGuardResult {
  return { ok: false, reason: `Could not check that Git ignores workspace memory (${detail}). Nothing was saved. Try again.` };
}

/** "Not a repository" is a definitive answer; any other failure is not. */
function isNotARepository(run: GitRun): boolean {
  return run.code === 128 && /not a git repository/i.test(run.stderr);
}

async function check(workspaceRoot: string, git: GitRunner): Promise<GitGuardResult> {
  const registry = memoryRegistry();
  const inside = await git(['rev-parse', '--is-inside-work-tree'], workspaceRoot);
  if (inside.code !== 0) {
    if (!isNotARepository(inside)) return failed(inside.stderr.trim() || `git exited with ${inside.code}`);
    registry.gitChecks.set(workspaceRoot, 'safe');
    return { ok: true };
  }
  if (inside.stdout.trim() !== 'true') {
    registry.gitChecks.set(workspaceRoot, 'safe');
    return { ok: true };
  }

  try {
    const excluded = await ensureGitStateIgnored(workspaceRoot, async (args, cwd) => {
      const run = await git(args, cwd);
      return run.code === 0 ? run.stdout.trim() || null : null;
    });
    if (!excluded) return failed('git did not name the exclude file');
  } catch (err) {
    return failed(err instanceof Error ? err.message : String(err));
  }

  const memoryDir = path.relative(workspaceRoot, workspaceMemoryDir(workspaceRoot));
  const tracked = await git(['ls-files', '--', memoryDir], workspaceRoot);
  if (tracked.code !== 0) return failed(tracked.stderr.trim() || `git exited with ${tracked.code}`);
  if (tracked.stdout.trim()) {
    registry.gitChecks.set(workspaceRoot, 'tracked');
    return { ok: false, reason: TRACKED_REASON };
  }
  registry.gitChecks.set(workspaceRoot, 'safe');
  return { ok: true };
}

/** Call before every workspace-memory write. Checks Git at most once per workspace per app run. */
export async function guardWorkspaceWrite(workspaceRoot: string, git: GitRunner = runGit): Promise<GitGuardResult> {
  const stored = memoryRegistry().gitChecks.get(workspaceRoot);
  if (stored === 'safe') return { ok: true };
  if (stored === 'tracked') return { ok: false, reason: TRACKED_REASON };
  return check(workspaceRoot, git);
}
