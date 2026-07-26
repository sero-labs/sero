/**
 * The hard states, derived once and read everywhere (§7).
 *
 * A merge that stopped, a repository with no commits and a detached HEAD are
 * modes the whole app is in, not properties of one pane — the banner, the top
 * bar, the working tree and the rail all have to agree about which one is
 * current. Deriving it in one place is what keeps them agreeing.
 *
 * Every unavailable action carries the reason it is unavailable, because
 * rule 20 disables rather than hides and puts the reason with the control.
 */

import type { GitAppState } from '../../shared/types';

export type RepoMode = 'merging' | 'detached' | 'unborn' | 'normal';

export interface RepoModeInfo {
  mode: RepoMode;
  /** Conflicted files still to resolve. */
  conflicts: number;
  /** Paths that conflicted during this merge, resolved ones included. */
  conflictPaths: string[];
  /** The branch or ref being merged in. */
  mergeFrom: string | null;
  /** What the commit button says — it names its object (rule 27). */
  commitLabel: string;
  /** A message the commit box starts with, where git already wrote one. */
  suggestedMessage: string | null;
  /** Why committing is off, or null when it is on. */
  commitBlockedReason: string | null;
  /** Why fetch/pull/push/PR are off, or null. Each is shown with its control. */
  fetchBlockedReason: string | null;
  pullBlockedReason: string | null;
  pushBlockedReason: string | null;
  pullRequestBlockedReason: string | null;
}

export function deriveRepoMode(state: GitAppState): RepoModeInfo {
  const conflictFiles = state.fileChanges.filter((file) => file.status === 'conflict');
  const conflicts = new Set(conflictFiles.map((file) => file.path)).size;
  const staged = state.fileChanges.filter((file) => file.staged).length;
  const hasRemote = state.remotes.length > 0;
  const mode = modeOf(state);

  const noRemote = hasRemote ? null : 'This repository has no remote yet.';
  const midMerge = 'Finish or abort the merge first.';
  const noCommits = 'There is nothing to sync until the first commit.';

  switch (mode) {
    case 'merging':
      return {
        mode,
        conflicts,
        conflictPaths: state.merge?.conflictPaths ?? [],
        mergeFrom: state.merge?.fromRef ?? null,
        commitLabel: 'Conclude merge',
        suggestedMessage: state.merge?.message || null,
        commitBlockedReason: conflicts > 0
          ? `${conflicts} conflict${conflicts === 1 ? '' : 's'} left to resolve`
          : null,
        fetchBlockedReason: midMerge,
        pullBlockedReason: midMerge,
        pushBlockedReason: midMerge,
        pullRequestBlockedReason: midMerge,
      };

    case 'unborn':
      return {
        mode,
        conflicts,
        conflictPaths: [],
        mergeFrom: null,
        commitLabel: 'Create the first commit',
        suggestedMessage: null,
        commitBlockedReason: state.fileChanges.length === 0
          ? 'Nothing to commit yet'
          : null,
        fetchBlockedReason: noRemote ?? noCommits,
        pullBlockedReason: noRemote ?? noCommits,
        pushBlockedReason: noRemote ?? noCommits,
        pullRequestBlockedReason: noRemote ?? noCommits,
      };

    case 'detached':
      return {
        mode,
        conflicts,
        conflictPaths: [],
        mergeFrom: null,
        commitLabel: commitCountLabel(staged),
        suggestedMessage: null,
        commitBlockedReason: 'Name a branch first, or this commit belongs to nothing',
        // Fetching changes nothing about where you are, so it stays on.
        fetchBlockedReason: noRemote,
        pullBlockedReason: 'You are not on a branch.',
        pushBlockedReason: 'You are not on a branch.',
        pullRequestBlockedReason: 'You are not on a branch.',
      };

    default:
      return {
        mode,
        conflicts,
        conflictPaths: [],
        mergeFrom: null,
        commitLabel: commitCountLabel(staged),
        suggestedMessage: null,
        // A conflict outside a merge (a cherry-pick, say) still blocks.
        //
        // Nothing staged is *not* a reason worth printing: the list directly
        // above already says "Nothing staged" and offers "Stage all", so a
        // third sentence saying the same thing is noise under the button.
        commitBlockedReason: conflicts > 0
          ? `${conflicts} conflict${conflicts === 1 ? '' : 's'} left to resolve`
          : null,
        fetchBlockedReason: noRemote,
        pullBlockedReason: noRemote,
        pushBlockedReason: noRemote,
        pullRequestBlockedReason: noRemote,
      };
  }
}

function modeOf(state: GitAppState): RepoMode {
  if (state.merge) return 'merging';
  if (state.detached) return 'detached';
  // A branch name with nothing on it: `git init`, before the first commit.
  if (!state.headHash && state.commitCount === 0) return 'unborn';
  return 'normal';
}

function commitCountLabel(staged: number): string {
  if (staged === 0) return 'Commit';
  return staged === 1 ? 'Commit 1 file' : `Commit ${staged} files`;
}

/** How the current position reads in the top bar. */
export function branchChipLabel(state: GitAppState, mode: RepoMode): string {
  if (mode === 'detached') return `detached at ${state.headHash || 'HEAD'}`;
  if (mode === 'unborn') return `${state.currentBranch || 'main'} · unborn`;
  return state.currentBranch;
}
