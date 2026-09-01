import { execWorktreeGit } from '../exec';
import { getPullRequestMergeState, type PullRequestMergeState } from '../../github/merge-state';
import { ghForPath } from '../../github/invoker';
import { resolveCommit, stderrOf } from '../provision';
import type { PoolSlot } from './types';

export interface PullRequestEvidence {
  number: number | null;
  state: PullRequestMergeState;
}

export interface PullRequestEvidenceProvider {
  forBranch(workspacePath: string, branchName: string, knownNumber: number | null): Promise<PullRequestEvidence>;
}

export type DisposabilityResult =
  | { status: 'disposable'; reason: string; branchTip: string; pullRequest: PullRequestEvidence | null }
  | { status: 'unmerged'; reason: string }
  | { status: 'unverifiable'; reason: string };

async function pullRequestEvidence(
  provider: PullRequestEvidenceProvider,
  workspacePath: string,
  branchName: string,
  knownNumber: number | null,
): Promise<PullRequestEvidence | null> {
  try {
    return await provider.forBranch(workspacePath, branchName, knownNumber);
  } catch {
    return null;
  }
}

export const githubPullRequestEvidence: PullRequestEvidenceProvider = {
  async forBranch(workspacePath, branchName, knownNumber) {
    if (knownNumber !== null) {
      return { number: knownNumber, state: await getPullRequestMergeState(ghForPath(workspacePath), knownNumber) };
    }
    try {
      const { stdout } = await ghForPath(workspacePath)([
        'pr', 'view', branchName, '--json', 'number,state,mergedAt',
      ], 15_000);
      const parsed = JSON.parse(stdout) as { number?: number; state?: string; mergedAt?: string | null };
      const number = typeof parsed.number === 'number' ? parsed.number : null;
      if (parsed.mergedAt) return { number, state: 'merged' };
      if (parsed.state === 'OPEN') return { number, state: 'open' };
      if (parsed.state === 'CLOSED') return { number, state: 'closed' };
      return { number, state: 'unknown' };
    } catch {
      return { number: null, state: 'unknown' };
    }
  },
};

async function isAncestor(cwd: string, ancestor: string, target: string): Promise<boolean | null> {
  try {
    await execWorktreeGit(['merge-base', '--is-ancestor', ancestor, target], { cwd, timeout: 15_000 });
    return true;
  } catch (error) {
    const detail = stderrOf(error);
    if (/exit code 1|Command failed/i.test(detail) && !/fatal|error/i.test(detail)) return false;
    // execFile errors do not consistently retain the numeric exit code in the
    // rendered message. A successful resolution of both commits means exit 1
    // is the ordinary "not ancestor" result.
    const [left, right] = await Promise.all([resolveCommit(cwd, ancestor), resolveCommit(cwd, target)]);
    return left && right ? false : null;
  }
}

/** Proves that leaving this branch cannot lose unmerged work. */
export async function classifyDisposability(
  workspacePath: string,
  slot: PoolSlot,
  targetCommit: string,
  provider: PullRequestEvidenceProvider = githubPullRequestEvidence,
): Promise<DisposabilityResult> {
  const lease = slot.lease;
  if (!lease || !slot.branchName) {
    return { status: 'unverifiable', reason: 'The slot has no lease and branch provenance.' };
  }
  const branchTip = await resolveCommit(slot.path, 'HEAD');
  if (!branchTip) return { status: 'unverifiable', reason: 'The branch tip could not be resolved.' };

  if (lease.branchKind === 'external-pr') {
    const pullRequest = await pullRequestEvidence(provider,
      workspacePath,
      slot.branchName,
      lease.pullRequestNumber,
    );
    if (!pullRequest) return { status: 'unverifiable', reason: 'Pull-request evidence could not be read.' };
    if (pullRequest.state === 'merged') {
      return {
        status: 'disposable',
        reason: `PR #${pullRequest.number ?? 'unknown'} is authoritatively merged; its external branch is retained.`,
        branchTip,
        pullRequest,
      };
    }
    const state = pullRequest.state === 'unknown' ? 'could not be verified' : `is ${pullRequest.state}`;
    return { status: 'unmerged', reason: `The external pull request ${state}, so its checkout is preserved.` };
  }

  const contained = await isAncestor(slot.path, branchTip, targetCommit);
  if (contained === true) {
    return {
      status: 'disposable',
      reason: 'The fresh branch tip is contained in the exact reset target.',
      branchTip,
      pullRequest: null,
    };
  }
  const pullRequest = await pullRequestEvidence(provider,
    workspacePath,
    slot.branchName,
    lease.pullRequestNumber,
  );
  if (!pullRequest) return { status: 'unverifiable', reason: 'Pull-request evidence could not be read.' };
  if (pullRequest.state === 'merged') {
    return {
      status: 'disposable',
      reason: `PR #${pullRequest.number ?? 'unknown'} is authoritatively merged (including squash or rebase merges).`,
      branchTip,
      pullRequest,
    };
  }
  if (contained === null) {
    return { status: 'unverifiable', reason: 'Git could not compare the branch tip with the exact reset target.' };
  }
  if (pullRequest.state === 'open' || pullRequest.state === 'closed') {
    return { status: 'unmerged', reason: `The branch PR is ${pullRequest.state}, not merged.` };
  }
  return { status: 'unmerged', reason: 'The local branch has commits outside the reset target and no merged PR proves disposal.' };
}
