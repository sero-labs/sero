/**
 * Sero's own footprint inside a user's repository, kept out of their way.
 *
 * Shared by the git app, which writes the rules on every refresh, and by
 * plugins that store state under a workspace's `.sero/` folder, which must make
 * sure the rules exist before their first write.
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

/**
 * Per-machine app state and the workspace's local config. Left alone they
 * show up as untracked changes and get swept into a "stage all", so the user
 * commits our bookkeeping into their project.
 *
 * Matched anywhere in the tree so nested workspaces (`repo/subdir/.sero/…`)
 * are covered too. Only `.sero/apps/git/` used to be listed, which meant any
 * *other* app writing state — the orchestrator, say — dragged the whole
 * `.sero/` directory back into the untracked list.
 *
 * This goes in `.git/info/exclude`, never the project's `.gitignore`: it is a
 * local preference, not a fact about the project, and it is not ours to commit.
 * It also only affects *untracked* files, so anyone who deliberately tracks
 * their `.sero-workspace.json` keeps it — git still reports changes to files it
 * already knows about.
 */
export const SERO_GIT_EXCLUDE_RULES = [
  '**/.sero/',
  '**/.sero-workspace.json',
] as const;

/**
 * Runs one git command in `cwd` and returns its trimmed output, or null when
 * git failed. The git app passes its own runner so container and remote
 * workspaces keep their routing.
 */
export type GitOutputRunner = (args: string[], cwd: string) => Promise<string | null>;

const execFileAsync = promisify(execFile);

/** Runs git on the host. Optional locks are off so a read never rewrites the index. */
export const runHostGit: GitOutputRunner = async (args, cwd) => {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout.trim();
  } catch {
    return null;
  }
};

/**
 * Makes sure `.git/info/exclude` holds every Sero rule.
 *
 * @returns false when git could not name the exclude file (not a repository,
 * or git failed). A failed file write throws.
 */
export async function ensureGitStateIgnored(
  cwd: string,
  runGit: GitOutputRunner = runHostGit,
): Promise<boolean> {
  // `--git-path` rather than `--git-dir`: in a linked worktree the git dir is
  // `.git/worktrees/<name>`, but the exclude file git actually reads lives in
  // the shared parent. Joining it onto `--git-dir` would write a file in the
  // worktree that git never looks at, so our own state would keep showing up
  // as untracked changes there.
  const excludePath = await runGit(['rev-parse', '--git-path', 'info/exclude'], cwd);
  if (!excludePath) return false;

  const resolvedExcludePath = path.isAbsolute(excludePath)
    ? excludePath
    : path.join(cwd, excludePath);

  let current = '';
  try {
    current = await fs.readFile(resolvedExcludePath, 'utf8');
  } catch {
    current = '';
  }

  const existingRules = new Set(
    current.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
  );
  const missing = SERO_GIT_EXCLUDE_RULES.filter((rule) => !existingRules.has(rule));
  if (missing.length === 0) return true;

  const next = `${current.replace(/\s*$/, '')}${current.trim() ? '\n' : ''}${missing.join('\n')}\n`;
  await fs.mkdir(path.dirname(resolvedExcludePath), { recursive: true });
  await fs.writeFile(resolvedExcludePath, next, 'utf8');
  return true;
}
