import type { Bookmark } from '@sero-ai/common';

import { inferConventionalType, isAutoPushBookmark, slugifyBranchLabel } from '../../support/branch-naming';
import type { GitRunner } from '../git-runner';

const DEFAULT_PRIMARY_BRANCH = 'main';

async function getCommitDescription(
  runner: GitRunner,
  workspaceId: string,
  changeId: string,
): Promise<string> {
  const result = await runner.run(workspaceId, [
    'log',
    '--format=%s',
    '-1',
    changeId,
  ]);

  if (result.exitCode !== 0) return '';
  return result.stdout.trim();
}

export async function suggestPushBranchForCommit(
  runner: GitRunner,
  workspaceId: string,
  changeId: string,
  bookmarks: Bookmark[],
): Promise<string> {
  // 1. Prefer an existing branch already pointing at this exact commit
  const localAtTarget = bookmarks
    .filter((bm) => bm.isLocal && bm.changeId === changeId)
    .map((bm) => bm.name);

  const preferredAtTarget = localAtTarget.find((name) => name === DEFAULT_PRIMARY_BRANCH)
    ?? localAtTarget.find((name) => !isAutoPushBookmark(name));
  if (preferredAtTarget) return preferredAtTarget;

  // 2. Generate a descriptive feature branch name
  const description = await getCommitDescription(runner, workspaceId, changeId);
  const type = inferConventionalType(description);
  const label = slugifyBranchLabel(description);
  return `${type}/${label}-${changeId.slice(0, 8)}`;
}

export async function ensureBranchAtCommit(
  runner: GitRunner,
  workspaceId: string,
  branch: string,
  changeId: string,
): Promise<void> {
  // Try creating the branch
  const create = await runner.run(workspaceId, [
    'branch',
    branch,
    changeId,
  ]);
  if (create.exitCode === 0) return;

  // Branch already exists — force move it
  const move = await runner.run(workspaceId, [
    'branch',
    '-f',
    branch,
    changeId,
  ]);

  if (move.exitCode !== 0) {
    throw new Error(move.stderr || `Failed to set branch '${branch}' to ${changeId}`);
  }
}

export async function resolveCurrentBranch(
  runner: GitRunner,
  workspaceId: string,
): Promise<string | undefined> {
  const result = await runner.run(workspaceId, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = result.exitCode === 0 ? result.stdout.trim() : undefined;
  // HEAD means detached — not a named branch
  return branch && branch !== 'HEAD' ? branch : undefined;
}
