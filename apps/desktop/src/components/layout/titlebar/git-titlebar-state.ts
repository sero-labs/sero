export type GitTitleBarSyncMode = 'manual' | 'watch' | 'poll';

export interface GitTitleBarBranch {
  name: string;
  current: boolean;
  remote?: string;
  ahead: number;
  behind: number;
}

export interface GitTitleBarFileChange {
  staged: boolean;
}

export interface GitTitleBarState {
  repoPath: string;
  repoName: string;
  currentBranch: string;
  branches: GitTitleBarBranch[];
  remotes: Array<{ name: string }>;
  fileChanges: GitTitleBarFileChange[];
  lastRefresh: string;
  loading: boolean;
  syncMode: GitTitleBarSyncMode;
  error?: string;
}

export const EMPTY_GIT_TITLE_STATE: GitTitleBarState = {
  repoPath: '',
  repoName: '',
  currentBranch: '',
  branches: [],
  remotes: [],
  fileChanges: [],
  lastRefresh: '',
  loading: true,
  syncMode: 'manual',
};

export function getGitStateFilePath(workspacePath: string): string {
  return `${workspacePath.replace(/\/+$/, '')}/.sero/apps/git/state.json`;
}

export function normalizeGitTitleState(
  data: unknown,
  workspacePath: string,
): GitTitleBarState {
  const value = (data && typeof data === 'object') ? (data as Partial<GitTitleBarState>) : null;
  return {
    repoPath: typeof value?.repoPath === 'string' ? value.repoPath : workspacePath,
    repoName: typeof value?.repoName === 'string' ? value.repoName : '',
    currentBranch: typeof value?.currentBranch === 'string' ? value.currentBranch : '',
    branches: Array.isArray(value?.branches) ? value.branches as GitTitleBarBranch[] : [],
    remotes: Array.isArray(value?.remotes) ? value.remotes as Array<{ name: string }> : [],
    fileChanges: Array.isArray(value?.fileChanges) ? value.fileChanges as GitTitleBarFileChange[] : [],
    lastRefresh: typeof value?.lastRefresh === 'string' ? value.lastRefresh : '',
    loading: typeof value?.loading === 'boolean' ? value.loading : false,
    syncMode: value?.syncMode === 'poll' || value?.syncMode === 'watch' ? value.syncMode : 'manual',
    error: typeof value?.error === 'string' ? value.error : undefined,
  };
}

export function formatGitRefreshTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Waiting';
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
