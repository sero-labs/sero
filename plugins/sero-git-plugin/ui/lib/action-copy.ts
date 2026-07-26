/**
 * The words the Git app puts on screen for a diff's context and for a failed
 * action.
 *
 * They live apart from the components that show them: a file that exports both
 * components and plain functions cannot keep its component state across a hot
 * reload during development.
 */

import type { GitManagerRequest } from '../../shared/types';
import type { DiffSelection } from '../components/diff/DiffPane';

export function diffContextLabel(selection: DiffSelection): string {
  switch (selection.kind) {
    case 'commit':
    case 'commitFile':
      return selection.hash.slice(0, 8);
    case 'workingCopy':
      return 'working tree';
    case 'working':
      return selection.staged ? 'staged' : 'working tree';
  }
}

export function getActionFailureTitle(action: GitManagerRequest['action']): string {
  switch (action) {
    case 'checkout':
      return 'Could not switch branch';
    case 'create_branch':
      return 'Could not create branch';
    case 'delete_branch':
      return 'Could not delete branch';
    case 'remove_worktree':
      return 'Could not remove worktree';
    case 'stage':
      return 'Could not stage changes';
    case 'unstage':
      return 'Could not unstage changes';
    case 'commit':
      return 'Could not create commit';
    case 'push':
      return 'Could not push changes';
    case 'pull':
      return 'Could not pull changes';
    case 'fetch':
      return 'Could not fetch remotes';
    case 'stash':
    case 'stash_pop':
    case 'stash_apply':
      return 'Could not update stashes';
    case 'cherry_pick':
      return 'Could not cherry-pick commit';
    case 'merge':
      return 'Could not merge branch';
    case 'diff':
      return 'Could not load diff';
    case 'show_commit':
      return 'Could not load commit details';
    default:
      return 'Git action failed';
  }
}
