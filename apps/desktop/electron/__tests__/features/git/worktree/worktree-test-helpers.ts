/**
 * Shared scaffolding for the real-Git worktree suites.
 *
 * Every one of these tests wants the same starting point: a repository with
 * one commit on `main`. Building that with `git init` plus config plus add
 * plus commit is five subprocess spawns per test, and there are dozens of
 * tests. `createRepoFromTemplate` builds it once per worker and hands out
 * plain directory copies — still real repositories, still real Git, at a
 * fraction of the cost.
 */

import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { createRepoFromTemplate } from '../git-service/git-test-helpers';

const execFileAsync = promisify(execFile);

export async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

async function initRepo(dir: string): Promise<void> {
  await git(dir, 'init', '-b', 'main');
  await git(dir, 'config', 'user.email', 'test@example.com');
  await git(dir, 'config', 'user.name', 'Test');
  await writeFile(path.join(dir, 'readme.md'), 'hello');
  await git(dir, 'add', '.');
  await git(dir, 'commit', '-m', 'init');
}

/** Copies of this root are handed out; each caller owns its own. */
const roots: string[] = [];

/**
 * A fresh workspace repository. The returned `root` is its parent directory,
 * so a test that needs a second repository (an "origin", a symlink target) has
 * somewhere to put it.
 */
export async function newWorkspaceRepo(prefix = 'sero-pool-'): Promise<{ root: string; workspace: string }> {
  const root = await createRepoFromTemplate(
    'worktree-pool-workspace',
    async (dir) => {
      const workspace = path.join(dir, 'workspace');
      await mkdir(workspace, { recursive: true });
      await initRepo(workspace);
    },
    prefix,
  );
  roots.push(root);
  return { root, workspace: path.join(root, 'workspace') };
}

/** One `afterAll` per suite is enough: each test owns its own copy. */
export async function removeWorkspaceRepos(): Promise<void> {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
}
