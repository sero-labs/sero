import type { Branch } from '@sero-ai/common';

import { inferConventionalType, isAutoPushBranch, slugifyBranchLabel } from '../../support/branch-naming';
import type { GitRunner } from '../git-runner';

const DEFAULT_PRIMARY_BRANCH = 'main';

async function getCommitDescription(
  runner: GitRunner,
  workspaceId: string,
  sha: string,
): Promise<string> {
  const result = await runner.run(workspaceId, [
    'log',
    '--format=%s',
    '-1',
    sha,
  ]);

  if (result.exitCode !== 0) return '';
  return result.stdout.trim();
}

export async function suggestPushBranchForCommit(
  runner: GitRunner,
  workspaceId: string,
  sha: string,
  branches: Branch[],
): Promise<string> {
  // 1. Prefer an existing branch already pointing at this exact commit
  const localAtTarget: string[] = [];
  for (const bm of branches) {
    if (bm.isLocal && bm.sha === sha) localAtTarget.push(bm.name);
  }

  const preferredAtTarget = localAtTarget.find((name) => name === DEFAULT_PRIMARY_BRANCH)
    ?? localAtTarget.find((name) => !isAutoPushBranch(name));
  if (preferredAtTarget) return preferredAtTarget;

  // 2. Generate a descriptive feature branch name
  const description = await getCommitDescription(runner, workspaceId, sha);
  const type = inferConventionalType(description);
  const label = slugifyBranchLabel(description);
  return `${type}/${label}-${sha.slice(0, 8)}`;
}

export async function ensureBranchAtCommit(
  runner: GitRunner,
  workspaceId: string,
  branch: string,
  sha: string,
): Promise<void> {
  // Try creating the branch
  const create = await runner.run(workspaceId, [
    'branch',
    branch,
    sha,
  ]);
  if (create.exitCode === 0) return;

  // Branch already exists — force move it
  const move = await runner.run(workspaceId, [
    'branch',
    '-f',
    branch,
    sha,
  ]);

  if (move.exitCode !== 0) {
    throw new Error(move.stderr || `Failed to set branch '${branch}' to ${sha}`);
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
