/**
 * Removal safety (issue #473, PR 1.1).
 *
 * The old cleanup ran `fs.rm(worktreePath, { recursive: true, force: true })`
 * after `git worktree remove` failed. A failed removal is Git reporting that
 * it cannot prove the checkout disposable, so the fallback destroyed exactly
 * the work the refusal was protecting. These tests hold the new contract:
 * a refusal keeps the directory, its contents, its registration and its branch.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';

import { WorktreeManager } from '@electron/features/git/worktree/manager';
import { removeRegisteredWorktree } from '@electron/features/git/worktree/removal';

const execFileAsync = promisify(execFile);
const roots: string[] = [];

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

async function newWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sero-worktree-removal-'));
  roots.push(root);
  const workspace = path.join(root, 'workspace');
  await execFileAsync('git', ['init', '-b', 'main', workspace]);
  await git(workspace, 'config', 'user.email', 'test@example.com');
  await git(workspace, 'config', 'user.name', 'Test');
  await writeFile(path.join(workspace, 'readme.md'), 'hello');
  await git(workspace, 'add', '.');
  await git(workspace, 'commit', '-m', 'init');
  return workspace;
}

afterAll(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('removeRegisteredWorktree', () => {
  it('keeps a dirty checkout, its contents and its registration when Git refuses', async () => {
    const workspace = await newWorkspace();
    const manager = new WorktreeManager();
    const created = await manager.create(workspace, 'card-1', 'Fix the parser');
    await writeFile(path.join(created.worktreePath, 'work.md'), 'hours of work');
    await git(created.worktreePath, 'add', '.');
    await git(created.worktreePath, 'commit', '-m', 'work');
    await writeFile(path.join(created.worktreePath, 'work.md'), 'and more, uncommitted');

    const outcome = await removeRegisteredWorktree(workspace, created.worktreePath);

    expect(outcome.status).toBe('preserved');
    expect(await readFile(path.join(created.worktreePath, 'work.md'), 'utf8')).toBe('and more, uncommitted');
    expect(await manager.exists(workspace, 'card-1')).toBe(true);
  });

  it('removes a clean checkout, which is Git\'s own deletion and not ours', async () => {
    const workspace = await newWorkspace();
    const manager = new WorktreeManager();
    const created = await manager.create(workspace, 'card-2', 'Routine scan');

    expect((await removeRegisteredWorktree(workspace, created.worktreePath)).status).toBe('removed');
    expect(await stat(created.worktreePath).catch(() => null)).toBeNull();
  });

  it('reports an unregistered path without deleting anything at it', async () => {
    const workspace = await newWorkspace();
    const stray = path.join(workspace, '.sero', 'worktrees', 'card-stray');
    await execFileAsync('mkdir', ['-p', stray]);
    await writeFile(path.join(stray, 'keep.md'), 'not git\'s to delete');

    const outcome = await removeRegisteredWorktree(workspace, stray);

    expect(outcome.status).toBe('not-registered');
    expect(await readFile(path.join(stray, 'keep.md'), 'utf8')).toBe('not git\'s to delete');
  });
});

describe('WorktreeManager.remove', () => {
  it('keeps the branch when the checkout could not be removed', async () => {
    const workspace = await newWorkspace();
    const manager = new WorktreeManager();
    const created = await manager.create(workspace, 'card-3', 'Fix the parser');
    await writeFile(path.join(created.worktreePath, 'scratch.md'), 'uncommitted');

    // No `force`, so Git refuses. The branch must survive with the checkout.
    await manager.remove(workspace, 'card-3', { deleteBranch: true });

    expect(await readFile(path.join(created.worktreePath, 'scratch.md'), 'utf8')).toBe('uncommitted');
    expect(await git(workspace, 'rev-parse', '--verify', `refs/heads/${created.branchName}`)).toBeTruthy();
  });

  it('answers exists() from Git registration, not from the directory', async () => {
    const workspace = await newWorkspace();
    const manager = new WorktreeManager();
    const created = await manager.create(workspace, 'card-4', 'Routine scan');
    await rm(path.join(workspace, '.git', 'worktrees'), { recursive: true, force: true });

    // The directory is still there; Git no longer knows about it.
    expect(await stat(created.worktreePath)).toBeTruthy();
    expect(await manager.exists(workspace, 'card-4')).toBe(false);
    const validation = await manager.validate(workspace, 'card-4');
    expect(validation.status).toBe('not-registered');
  });
});
