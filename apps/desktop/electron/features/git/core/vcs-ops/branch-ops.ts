import type { Branch } from '@sero-ai/common';

import { BRANCH_FORMAT, parseBranches } from '../../support/parsers';
import type { GitRunner } from '../git-runner';

export async function listBranches(
  runner: GitRunner,
  workspaceId: string,
): Promise<Branch[]> {
  const result = await runner.run(workspaceId, [
    'branch',
    `--format=${BRANCH_FORMAT}`,
  ]);
  if (result.exitCode !== 0) {
    // No branches yet is fine (empty repo)
    return [];
  }

  return parseBranches(result.stdout);
}

export async function createBranch(
  runner: GitRunner,
  workspaceId: string,
  name: string,
  revision = 'HEAD',
): Promise<void> {
  const result = await runner.run(workspaceId, [
    'branch',
    name,
    revision,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Failed to create branch '${name}'`);
  }
}

export async function deleteBranch(
  runner: GitRunner,
  workspaceId: string,
  name: string,
): Promise<void> {
  const result = await runner.run(workspaceId, ['branch', '-d', name]);
  if (result.exitCode !== 0) {
    // Try force delete
    const force = await runner.run(workspaceId, ['branch', '-D', name]);
    if (force.exitCode !== 0) {
      throw new Error(force.stderr || `Failed to delete branch '${name}'`);
    }
  }
}

export async function moveBranch(
  runner: GitRunner,
  workspaceId: string,
  name: string,
  toRevision: string,
): Promise<void> {
  const result = await runner.run(workspaceId, [
    'branch',
    '-f',
    name,
    toRevision,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Failed to move branch '${name}'`);
  }
}
