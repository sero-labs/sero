import type {
  BranchInfo,
  GitAppState,
  GitSyncMode,
  RemoteInfo,
} from '@sero-ai/common';
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

export async function createGitRefSnapshot(cwd: string): Promise<GitRefSnapshot> {
  return {
    currentBranch: await getCurrentBranch(cwd),
    headHash: await getHeadHash(cwd),
    defaultBranch: await getDefaultBranch(cwd),
    branches: await getBranches(cwd),
    remoteBranches: await getRemoteBranches(cwd),
    remotes: await getRemotes(cwd),
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

export async function createQuickRefreshState(
  cwd: string,
  syncMode: GitSyncMode,
  previousState: GitAppState,
  snapshot: GitRefSnapshot,
): Promise<GitAppState> {
  return {
    ...previousState,
    repoPath: cwd,
    repoName: await getRepoName(cwd),
    currentBranch: snapshot.currentBranch,
    headHash: snapshot.headHash,
    defaultBranch: snapshot.defaultBranch,
    branches: snapshot.branches,
    remoteBranches: snapshot.remoteBranches,
    remotes: snapshot.remotes,
    fileChanges: await getFileChanges(cwd),
    stashes: await getStashes(cwd),
    lastRefresh: new Date().toISOString(),
    loading: false,
    syncMode,
    error: undefined,
  };
}
