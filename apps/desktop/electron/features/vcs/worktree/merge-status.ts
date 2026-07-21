import { execWorktreeGh } from './exec';

export type PullRequestMergeState = 'merged' | 'open' | 'closed' | 'unknown';

export async function getPullRequestMergeState(
  worktreePath: string,
  prNumber: number,
): Promise<PullRequestMergeState> {
  try {
    const { stdout } = await execWorktreeGh(
      ['pr', 'view', String(prNumber), '--json', 'state,mergedAt'],
      { cwd: worktreePath, timeout: 15_000 },
    );
    const parsed = JSON.parse(stdout) as { state?: string; mergedAt?: string | null };
    if (parsed.mergedAt) return 'merged';
    if (parsed.state === 'OPEN') return 'open';
    if (parsed.state === 'CLOSED') return 'closed';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function getPullRequestMergeError(
  worktreePath: string,
  prNumber: number,
): Promise<string | null> {
  const mergeState = await getPullRequestMergeState(worktreePath, prNumber);
  if (mergeState === 'merged') return null;
  if (mergeState === 'open') return `Awaiting review. Merge PR #${prNumber} before marking this card done.`;
  if (mergeState === 'closed') return `PR #${prNumber} was closed without merging. Re-open or create a new PR before marking this card done.`;
  return `Could not verify whether PR #${prNumber} was merged.`;
}
