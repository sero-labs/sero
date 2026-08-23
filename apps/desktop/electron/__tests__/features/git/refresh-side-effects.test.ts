/**
 * Reading the repository must not change it, and must not throw away what the
 * user has open.
 *
 * Two defects, one symptom. Asking git for the working-tree status made git
 * rewrite `.git/index` to cache the file stats it had just gathered. We watch
 * the git directory to notice real changes, so that write looked like one, and
 * every refresh triggered another — several a second, for as long as the Git
 * app was open. Each of those refreshes then rebuilt the state file from
 * scratch and dropped the commit the user had opened, so its file list emptied
 * itself a moment after appearing.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { readFile, stat, rm } from 'node:fs/promises';
import path from 'node:path';

import { refreshGitState } from '@electron/features/git/git-service/git-service';
import { runGitAction } from '@electron/features/git/git-service/git-service';
import { resolveStatePath } from '@electron/features/git/git-service/state-io';
import { createSeededRepo, runGit } from './git-service/git-test-helpers';

const repos: string[] = [];

async function repoWithACommit(): Promise<string> {
  const repoPath = await createSeededRepo(
    { 'README.md': '# Project\n', 'src.ts': 'export const x = 1;\n' },
    { message: 'initial commit', prefix: 'refresh-side-effects-' },
  );
  repos.push(repoPath);
  return repoPath;
}

// Each test owns its own repository copy, so one cleanup at the end is enough.
afterAll(async () => {
  await Promise.all(repos.splice(0).map((repoPath) => rm(repoPath, { recursive: true, force: true })));
});

describe('refreshing git state', () => {
  it('does not write to the git directory, so watching it cannot loop', async () => {
    const repoPath = await repoWithACommit();
    const statePath = resolveStatePath(repoPath);
    const indexPath = path.join(repoPath, '.git', 'index');

    // Settle: the first refresh may legitimately create things.
    await refreshGitState(repoPath, statePath);
    const before = await stat(indexPath);

    await refreshGitState(repoPath, statePath);
    await refreshGitState(repoPath, statePath);

    const after = await stat(indexPath);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  it('keeps the commit the user has open across a refresh', async () => {
    const repoPath = await repoWithACommit();
    const statePath = resolveStatePath(repoPath);
    const hash = runGit(['rev-parse', 'HEAD'], repoPath).trim();

    await refreshGitState(repoPath, statePath);
    const shown = await runGitAction({ action: 'show_commit', hash }, repoPath, statePath);
    expect(shown.ok).toBe(true);

    // A full refresh rebuilds everything about the repository. What the user
    // asked to see is not about the repository, and must survive it.
    await refreshGitState(repoPath, statePath, { scope: 'full' });

    const state = JSON.parse(await readFile(statePath, 'utf8')) as {
      selectedCommitHash?: string;
      commitDiffs?: unknown[];
    };
    expect(state.selectedCommitHash).toBe(hash);
    expect(state.commitDiffs).toHaveLength(2);
  });
});
