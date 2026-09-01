/**
 * Removal safety (issue #473, PR 1.1).
 *
 * The old cleanup ran `fs.rm(worktreePath, { recursive: true, force: true })`
 * after `git worktree remove` failed. A failed removal is Git reporting that
 * it cannot prove the checkout disposable, so the fallback destroyed exactly
 * the work the refusal was protecting. These tests hold the new contract:
 * a refusal keeps the directory, its contents, its registration and its branch.
 */

import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

// Real Git against real repositories: each case spawns a dozen subprocesses,
// and the default 5s budget is a timing assertion nobody meant to write. It
// fires under full-suite parallelism and passes in isolation, which is the
// worst kind of failure to read.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

import { WorktreeManager } from '@electron/features/git/worktree/manager';
import { removeRegisteredWorktree } from '@electron/features/git/worktree/removal';
import { git, newWorkspaceRepo, removeWorkspaceRepos } from './worktree-test-helpers';

async function newWorkspace(): Promise<string> {
  return (await newWorkspaceRepo('sero-worktree-removal-')).workspace;
}

afterAll(removeWorkspaceRepos);

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
    await mkdir(stray, { recursive: true });
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
