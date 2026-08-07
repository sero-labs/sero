/**
 * VCS IPC channel constants.
 *
 * Split out of ipc-channels.ts to keep that file under 500 LOC. AD-025: every
 * renderer git write goes through `run`.
 */

export const vcsIpcChannels = {
  list: 'sero:vcs:list-checkpoints',
  state: 'sero:vcs:state',
  create: 'sero:vcs:create-checkpoint',
  restore: 'sero:vcs:restore',
  diff: 'sero:vcs:diff',
  event: 'sero:vcs:event',
  // Rich VCS operations
  logEntries: 'sero:vcs:log-entries',
  fileDiffSummary: 'sero:vcs:file-diff-summary',
  fileContent: 'sero:vcs:file-content',
  amendMessage: 'sero:vcs:amend-message',
  createBranch: 'sero:vcs:create-branch',
  deleteBranch: 'sero:vcs:delete-branch',
  moveBranch: 'sero:vcs:move-branch',
  remotes: 'sero:vcs:remotes',
  addRemote: 'sero:vcs:add-remote',
  setRemoteUrl: 'sero:vcs:set-remote-url',
  removeRemote: 'sero:vcs:remove-remote',
  checkoutRemote: 'sero:vcs:checkout-remote',
  connectRemote: 'sero:vcs:connect-remote',
  publishRepo: 'sero:vcs:publish-repo',
  fetch: 'sero:vcs:fetch',
  push: 'sero:vcs:push',
  prState: 'sero:vcs:pr-state',
  prPreview: 'sero:vcs:pr-preview',
  prGenerateDraft: 'sero:vcs:pr-generate-draft',
  /** Draft a commit message for what is about to be committed (git-ux §10). */
  commitDraftMessage: 'sero:vcs:commit-draft-message',
  /** Resolve one merge conflict, or ask about it, or decline it (git-ux §7). */
  resolveConflictWithAi: 'sero:vcs:resolve-conflict-ai',
  prCreate: 'sero:vcs:pr-create',
  undo: 'sero:vcs:undo',
  discardCommit: 'sero:vcs:discard-commit',
  /** Force a re-derive of the pushed repo-state cache (Refresh button, manual sync mode). */
  refreshState: 'sero:vcs:refresh-state',
  // Repo-scoped gh reads (Agent Board backlog + PR chips)
  issues: 'sero:vcs:issues',
  openPrs: 'sero:vcs:open-prs',
  /** Aggregate +adds −dels of a checkout (workspace root or loop worktree). */
  diffStat: 'sero:vcs:diff-stat',
  /**
   * Run one named git action against a workspace — staging, committing,
   * stashing, switching branch (AD-025). Every write the renderer makes goes
   * through here, sharing one implementation with the agent's `git_manager`
   * tool rather than a second copy of each action's guards.
   */
  run: 'sero:vcs:run',
} as const;
