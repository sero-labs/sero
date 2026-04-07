import type {
  BranchInfo,
  GitAppState,
  GitSyncMode,
  RemoteInfo,
} from '../shared/types';
import {
  getCurrentBranch,
  getFileChanges,
  getHeadHash,
  getRemotes,
  getRepoName,
  getStashes,
} from './git-commands';
import { getDefaultBranch } from './git-default-branch';
import { getBranches, getRemoteBranches } from './git-refs';

interface GitRefSnapshot {
  currentBranch: string;
  headHash: string;
  defaultBranch?: string;
  branches: BranchInfo[];
  remoteBranches: BranchInfo[];
  remotes: RemoteInfo[];
}

function serializeBranch(branch: BranchInfo): string {
  return [
    branch.name,
    branch.current ? '1' : '0',
    branch.remote ?? '',
    String(branch.ahead),
    String(branch.behind),
    branch.lastCommitHash ?? '',
    branch.lastCommitDate ?? '',
    branch.checkedOutIn ?? '',
  ].join('\u0000');
}

function serializeRemote(remote: RemoteInfo): string {
  return [remote.name, remote.fetchUrl, remote.pushUrl].join('\u0000');
}

function createRefSignature(snapshot: Pick<GitRefSnapshot, 'defaultBranch' | 'branches' | 'remoteBranches' | 'remotes'>): string {
  const remotes = [...snapshot.remotes].sort((a, b) => a.name.localeCompare(b.name));
  return [
    snapshot.defaultBranch ?? '',
    snapshot.branches.map(serializeBranch).join('\n'),
    snapshot.remoteBranches.map(serializeBranch).join('\n'),
    remotes.map(serializeRemote).join('\n'),
  ].join('\n---\n');
}

export function createGitRefSnapshot(cwd: string): GitRefSnapshot {
  return {
    currentBranch: getCurrentBranch(cwd),
    headHash: getHeadHash(cwd),
    defaultBranch: getDefaultBranch(cwd),
    branches: getBranches(cwd),
    remoteBranches: getRemoteBranches(cwd),
    remotes: getRemotes(cwd),
  };
}

export function canUseQuickRefresh(previousState: GitAppState, snapshot: GitRefSnapshot): boolean {
  if (!previousState.repoPath) return false;
  if (!previousState.commits.length) return false;
  if (!previousState.branches.length && !previousState.remoteBranches.length) return false;
  if (previousState.currentBranch !== snapshot.currentBranch) return false;
  if (previousState.headHash !== snapshot.headHash) return false;

  return createRefSignature(previousState) === createRefSignature(snapshot);
}

export function createQuickRefreshState(
  cwd: string,
  syncMode: GitSyncMode,
  previousState: GitAppState,
  snapshot: GitRefSnapshot,
): GitAppState {
  return {
    ...previousState,
    repoPath: cwd,
    repoName: getRepoName(cwd),
    currentBranch: snapshot.currentBranch,
    headHash: snapshot.headHash,
    defaultBranch: snapshot.defaultBranch,
    branches: snapshot.branches,
    remoteBranches: snapshot.remoteBranches,
    remotes: snapshot.remotes,
    fileChanges: getFileChanges(cwd),
    stashes: getStashes(cwd),
    lastRefresh: new Date().toISOString(),
    loading: false,
    syncMode,
    error: undefined,
  };
}
