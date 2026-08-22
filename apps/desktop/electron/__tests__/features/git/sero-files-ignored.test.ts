/**
 * Sero's own files stay out of the user's repository.
 *
 * `.sero/` holds per-machine app state and `.sero-workspace.json` is the
 * workspace's local config. Both are ours, not the user's project's. Left
 * untracked they appear in the working tree, get swept into a "stage all", and
 * end up committed — which is how Sero's bookkeeping lands in someone's PR.
 *
 * Regression: only `.sero/apps/git/` was excluded, so as soon as any *other*
 * app wrote state — the orchestrator, in the case that surfaced this — the
 * whole `.sero/` directory reappeared as untracked, alongside the workspace
 * file that was never covered at all.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { refreshGitState } from '@electron/features/git/git-service/git-service';
import { resolveStatePath } from '@electron/features/git/git-service/state-io';
import { createRepoFromTemplate, runGit } from './git-service/git-test-helpers';

/** The starting repository is identical for every test here, so build it once and copy it. */
async function buildRepoWithSeroFiles(repoPath: string): Promise<void> {
  runGit(['init'], repoPath);
  runGit(['config', 'user.name', 'Sero Test'], repoPath);
  runGit(['config', 'user.email', 'test@example.com'], repoPath);

  await writeFile(path.join(repoPath, 'README.md'), '# Project\n', 'utf8');
  runGit(['add', '.'], repoPath);
  runGit(['commit', '-m', 'initial commit'], repoPath);

  // What Sero leaves behind in a workspace.
  await writeFile(path.join(repoPath, '.sero-workspace.json'), '{"id":"demo"}\n', 'utf8');
  await mkdir(path.join(repoPath, '.sero/apps/git'), { recursive: true });
  await mkdir(path.join(repoPath, '.sero/apps/orchestrator'), { recursive: true });
  await writeFile(path.join(repoPath, '.sero/apps/git/state.json'), '{}\n', 'utf8');
  await writeFile(path.join(repoPath, '.sero/apps/orchestrator/state.json'), '{}\n', 'utf8');
}

const repos: string[] = [];

async function repoWithSeroFiles(): Promise<string> {
  const repoPath = await createRepoFromTemplate('sero-files', buildRepoWithSeroFiles, 'sero-ignore-');
  repos.push(repoPath);
  return repoPath;
}

// Each test owns its own repository copy, so one cleanup at the end is enough.
afterAll(async () => {
  await Promise.all(repos.splice(0).map((repoPath) => rm(repoPath, { recursive: true, force: true })));
});

describe("Sero's own files in a user's repository", () => {
  it('leaves none of them showing as changes', async () => {
    const repoPath = await repoWithSeroFiles();

    // Before: git sees all of it.
    expect(runGit(['status', '--porcelain=v1'], repoPath)).toContain('.sero');

    await refreshGitState(repoPath, resolveStatePath(repoPath));

    const status = runGit(['status', '--porcelain=v1'], repoPath);
    expect(status).not.toContain('.sero-workspace.json');
    expect(status).not.toContain('.sero/');
  });

  it('writes the rules to .git/info/exclude, never the project .gitignore', async () => {
    const repoPath = await repoWithSeroFiles();
    await refreshGitState(repoPath, resolveStatePath(repoPath));

    const exclude = await readFile(path.join(repoPath, '.git/info/exclude'), 'utf8');
    expect(exclude).toContain('**/.sero/');
    expect(exclude).toContain('**/.sero-workspace.json');

    // The project's own ignore file is the project's business.
    await expect(readFile(path.join(repoPath, '.gitignore'), 'utf8')).rejects.toThrow();
  });

  it('does not repeat the rules on every refresh', async () => {
    const repoPath = await repoWithSeroFiles();
    const statePath = resolveStatePath(repoPath);

    await refreshGitState(repoPath, statePath);
    await refreshGitState(repoPath, statePath);
    await refreshGitState(repoPath, statePath);

    const exclude = await readFile(path.join(repoPath, '.git/info/exclude'), 'utf8');
    const occurrences = exclude.split('\n').filter((line) => line.trim() === '**/.sero/').length;
    expect(occurrences).toBe(1);
  });

  /**
   * `.git/info/exclude` only governs untracked files, so someone who has
   * deliberately committed their workspace config keeps it. Worth pinning: it
   * is the reason excluding these by default is safe rather than presumptuous.
   */
  it('still reports a workspace file the user chose to track', async () => {
    const repoPath = await repoWithSeroFiles();
    runGit(['add', '-f', '.sero-workspace.json'], repoPath);
    runGit(['commit', '-m', 'track the workspace config'], repoPath);

    await refreshGitState(repoPath, resolveStatePath(repoPath));
    await writeFile(path.join(repoPath, '.sero-workspace.json'), '{"id":"changed"}\n', 'utf8');

    const status = runGit(['status', '--porcelain=v1'], repoPath);
    expect(status).toContain('.sero-workspace.json');
  });
});
