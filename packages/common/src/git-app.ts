export type GitManagerAction =
  | 'refresh'
  | 'status'
  | 'log'
  | 'branches'
  | 'diff'
  | 'stage'
  | 'unstage'
  | 'commit'
  | 'checkout'
  | 'stash'
  | 'stash_pop'
  | 'stash_apply'
  | 'fetch'
  | 'pull'
  | 'push'
  | 'create_branch'
  | 'delete_branch'
  | 'remove_worktree'
  | 'merge'
  | 'cherry_pick'
  | 'show_commit';

export interface GitManagerRequest {
  action: GitManagerAction;
  file?: string;
  message?: string;
  branch?: string;
  hash?: string;
  worktreePath?: string;
  staged?: boolean;
  all?: boolean;
  force?: boolean;
  stashIndex?: number;
}

export interface GitActionResult {
  ok: boolean;
  message: string;
}
