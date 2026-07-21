/**
 * Adapters from the unified GitAppState (the pushed `.sero/apps/git/state.json`
 * cache) to the explorer's VCS view shapes. One repo-state cache feeds the
 * titlebar, the git app, and the explorer panel; these mappings keep the
 * explorer components' props unchanged.
 */

import type {
  Branch,
  CommitEntry,
  GitAppState,
  Remote,
  StatusFile,
  WorkingCopyStatus,
} from '@sero-ai/common';
import { normalizeGitState } from '@sero-ai/common';

export function getGitStateFilePath(workspacePath: string): string {
  return `${workspacePath.replace(/\/+$/, '')}/.sero/apps/git/state.json`;
}

export function normalizeGitAppState(data: unknown): GitAppState {
  return normalizeGitState(data as Partial<GitAppState> | null | undefined);
}

export function adaptBranches(state: GitAppState): Branch[] {
  return state.branches.map((branch) => ({
    name: branch.name,
    sha: branch.lastCommitHash ?? '',
    isLocal: true,
    remoteStatuses: branch.remote
      ? [{
          remote: branch.remote.split('/')[0] || 'origin',
          synced: branch.ahead === 0 && branch.behind === 0,
        }]
      : [],
  }));
}

export function adaptRemotes(state: GitAppState): Remote[] {
  return state.remotes.map((remote) => ({
    name: remote.name,
    url: remote.fetchUrl || remote.pushUrl,
  }));
}

/**
 * GitAppState lists a file once per staged/unstaged side; the explorer status
 * shows one row per path with the staged side taking priority.
 */
export function adaptWorkingCopyStatus(state: GitAppState): WorkingCopyStatus {
  const byPath = new Map<string, StatusFile>();
  let conflictCount = 0;

  for (const change of state.fileChanges) {
    const existing = byPath.get(change.path);
    if (existing && !change.staged) continue;
    byPath.set(change.path, {
      path: change.path,
      // The explorer status vocabulary treats untracked files as added.
      status: change.status === 'untracked' ? 'added' : change.status,
      oldPath: change.oldPath,
    });
  }

  for (const file of byPath.values()) {
    if (file.status === 'conflict') conflictCount++;
  }

  return { files: Array.from(byPath.values()), conflictCount, parentShas: [] };
}

/**
 * The unified cache holds the all-refs commit graph; the explorer log shows
 * HEAD history. Walk parents from the head commit so the content matches
 * what `git log` from HEAD would return.
 */
export function deriveHeadLog(state: GitAppState, limit: number): CommitEntry[] {
  if (!state.commits.length) return [];

  const byHash = new Map(state.commits.map((commit) => [commit.hash, commit]));
  const head = state.headHash
    ? state.commits.find((commit) => commit.shortHash === state.headHash || commit.hash.startsWith(state.headHash))
    : state.commits.find((commit) => commit.refs.some((ref) => ref.type === 'head'));
  if (!head) return [];

  // Mark everything reachable from HEAD, then keep the cache's own
  // topological order for the filtered list.
  const reachable = new Set<string>();
  const queue = [head.hash];
  while (queue.length) {
    const hash = queue.pop();
    if (!hash || reachable.has(hash)) continue;
    reachable.add(hash);
    const node = byHash.get(hash);
    if (node) queue.push(...node.parents);
  }

  return state.commits
    .filter((commit) => reachable.has(commit.hash))
    .slice(0, limit)
    .map((node) => ({
      sha: node.shortHash,
      fullSha: node.hash.slice(0, 12),
      author: node.authorName,
      email: node.authorEmail,
      timestamp: node.authorDate,
      description: node.subject || '(no description)',
      empty: false,
      conflict: false,
      immutable: false,
      isWorkingCopy: node.hash === head.hash,
      branches: node.refs
        .filter((ref) => ref.type === 'local' || ref.type === 'head')
        .map((ref) => ref.name),
      tags: node.refs.filter((ref) => ref.type === 'tag').map((ref) => ref.name),
    }));
}
