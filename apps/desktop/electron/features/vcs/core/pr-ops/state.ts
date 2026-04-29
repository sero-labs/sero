import type { Bookmark, PullRequestState } from '@sero-ai/common';

import { BRANCH_FORMAT, parseBranches, parseRemotes } from '../../support/parsers';
import type { GitRunner } from '../git-runner';

const DEFAULT_BASE_BRANCH = 'main';
const FALLBACK_BASE_BRANCH = 'master';

export async function listBranches(
  runner: GitRunner,
  workspaceId: string,
): Promise<Bookmark[]> {
  const result = await runner.run(workspaceId, [
    'branch',
    `--format=${BRANCH_FORMAT}`,
  ]);
  if (result.exitCode !== 0) return [];
  return parseBranches(result.stdout);
}

async function resolveRemote(
  runner: GitRunner,
  workspaceId: string,
): Promise<string | undefined> {
  const result = await runner.run(workspaceId, ['remote', '-v']);
  if (result.exitCode !== 0) return undefined;
  const remotes = parseRemotes(result.stdout);
  return remotes.find((r) => r.name === 'origin')?.name ?? remotes[0]?.name;
}

async function resolveDefaultBaseBranch(
  runner: GitRunner,
  workspaceId: string,
  allBranchNames: Set<string>,
): Promise<string> {
  const remote = await resolveRemote(runner, workspaceId);
  if (remote) {
    const headRef = await runner.runCommand(
      workspaceId,
      'git',
      ['symbolic-ref', `refs/remotes/${remote}/HEAD`],
    );
    if (headRef.exitCode === 0) {
      const head = headRef.stdout.trim();
      const prefix = `refs/remotes/${remote}/`;
      if (head.startsWith(prefix)) {
        const branch = head.slice(prefix.length).trim();
        if (branch) return branch;
      }
    }
  }

  if (allBranchNames.has(DEFAULT_BASE_BRANCH)) return DEFAULT_BASE_BRANCH;
  if (allBranchNames.has(FALLBACK_BASE_BRANCH)) return FALLBACK_BASE_BRANCH;

  const first = Array.from(allBranchNames).sort((a, b) => a.localeCompare(b))[0];
  return first ?? DEFAULT_BASE_BRANCH;
}

export async function getPullRequestState(
  runner: GitRunner,
  workspaceId: string,
): Promise<PullRequestState> {
  const branches = await listBranches(runner, workspaceId);
  const sourceBranches = Array.from(
    new Set(
      branches
        .filter((b) => b.isLocal)
        .map((b) => b.name.trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const allBranchNames = new Set<string>();
  for (const branch of branches) {
    const name = branch.name.trim();
    if (name) allBranchNames.add(name);
  }
  for (const source of sourceBranches) allBranchNames.add(source);

  const defaultBaseBranch = await resolveDefaultBaseBranch(runner, workspaceId, allBranchNames);
  allBranchNames.add(defaultBaseBranch);

  const targetBranches = Array.from(allBranchNames).sort((a, b) => {
    if (a === defaultBaseBranch) return -1;
    if (b === defaultBaseBranch) return 1;
    return a.localeCompare(b);
  });

  return { defaultBaseBranch, sourceBranches, targetBranches };
}

export function resolveSourceBranch(state: PullRequestState, sourceBranch?: string): string {
  const requested = sourceBranch?.trim();
  if (requested) return requested;

  return (
    state.sourceBranches.find((branch) => branch !== state.defaultBaseBranch)
    ?? state.sourceBranches[0]
    ?? ''
  );
}

export function resolveTargetBranch(state: PullRequestState, targetBranch?: string): string {
  const requested = targetBranch?.trim();
  return requested || state.defaultBaseBranch;
}
