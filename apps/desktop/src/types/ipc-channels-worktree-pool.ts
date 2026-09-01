export const worktreePoolIpcChannels = {
  status: 'sero:worktree-pool:status',
  createCleanupPlan: 'sero:worktree-pool:create-cleanup-plan',
  executeCleanupPlan: 'sero:worktree-pool:execute-cleanup-plan',
} as const;
