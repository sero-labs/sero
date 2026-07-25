/**
 * WorktreeManager existing-branch checkout (orchestrator spec 15, FR-P2):
 * PR-lifecycle work must land on the PR's own branch, so `create` with
 * `existingBranch` checks that branch out instead of minting a new one —
 * from a local ref, or from origin when it only exists remotely. Real git
 * against temp repos; no mocks.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WorktreeManager } from '@electron/features/git/worktree/manager';

const execFileAsync = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
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

describe('WorktreeManager.create with existingBranch', () => {
  let root: string;
  let workspace: string;
  const manager = new WorktreeManager();

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'wt-existing-'));
    workspace = path.join(root, 'workspace');
    await execFileAsync('mkdir', ['-p', workspace]);
    await initRepo(workspace);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('checks out a local branch as-is, minting nothing', async () => {
    await git(workspace, 'branch', 'feat/pr-branch');
    const result = await manager.create(workspace, 'loop-1', 'ignored title', { existingBranch: 'feat/pr-branch' });

    expect(result.branchName).toBe('feat/pr-branch');
    expect(await git(result.worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('feat/pr-branch');
    // Removal keeps the branch — it belongs to the PR.
    await manager.remove(workspace, 'loop-1');
    expect(await git(workspace, 'rev-parse', '--verify', 'refs/heads/feat/pr-branch')).toBeTruthy();
  });

  it('fetches and tracks a branch that only exists on origin', async () => {
    // A second repo plays "origin" holding the PR branch.
    const origin = path.join(root, 'origin');
    await execFileAsync('mkdir', ['-p', origin]);
    await initRepo(origin);
    await git(origin, 'checkout', '-b', 'feat/remote-only');
    await writeFile(path.join(origin, 'change.md'), 'remote work');
    await git(origin, 'add', '.');
    await git(origin, 'commit', '-m', 'remote work');
    await git(workspace, 'remote', 'add', 'origin', origin);

    const result = await manager.create(workspace, 'loop-2', 'ignored', { existingBranch: 'feat/remote-only' });

    expect(result.branchName).toBe('feat/remote-only');
    expect(await git(result.worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('feat/remote-only');
    const upstream = await git(result.worktreePath, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}');
    expect(upstream).toBe('origin/feat/remote-only');
  });

  it('errors clearly when the branch exists nowhere — never falls back to a fresh branch', async () => {
    await expect(manager.create(workspace, 'loop-3', 'ignored', { existingBranch: 'no/such-branch' })).rejects.toThrow(
      'exists neither locally nor on origin',
    );
  });

  it('refuses branch names git would refuse', async () => {
    await expect(manager.create(workspace, 'loop-4', 'ignored', { existingBranch: '--upload-pack=x' })).rejects.toThrow(
      'Invalid branch name',
    );
    await expect(manager.create(workspace, 'loop-5', 'ignored', { existingBranch: 'a..b' })).rejects.toThrow(
      'Invalid branch name',
    );
  });
});

describe('WorktreeManager merged-branch cleanup', () => {
  let root: string;
  let workspace: string;
  const manager = new WorktreeManager();

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'wt-cleanup-'));
    workspace = path.join(root, 'workspace');
    await execFileAsync('mkdir', ['-p', workspace]);
    await initRepo(workspace);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('deletes a no-op branch that is fully merged', async () => {
    const worktree = await manager.create(workspace, 'loop-1-r1', 'Routine scan');
    await manager.remove(workspace, 'loop-1-r1', { force: true, deleteMergedBranch: true });

    await expect(git(workspace, 'rev-parse', '--verify', `refs/heads/${worktree.branchName}`)).rejects.toThrow();
  });

  it('preserves a branch with unmerged work', async () => {
    const worktree = await manager.create(workspace, 'loop-1-r2', 'Implement change');
    await writeFile(path.join(worktree.worktreePath, 'change.md'), 'work in progress');
    await git(worktree.worktreePath, 'add', '.');
    await git(worktree.worktreePath, 'commit', '-m', 'feat: work in progress');

    await manager.remove(workspace, 'loop-1-r2', { force: true, deleteMergedBranch: true });

    expect(await git(workspace, 'rev-parse', '--verify', `refs/heads/${worktree.branchName}`)).toBeTruthy();
  });
});
