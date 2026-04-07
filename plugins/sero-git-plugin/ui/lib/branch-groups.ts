import type { BranchInfo, RemoteInfo } from '../../shared/types';

export interface RemoteBranchGroup {
  name: string;
  host: string;
  branches: BranchInfo[];
}

function getBranchTimestamp(branch: BranchInfo): number {
  return branch.lastCommitDate ? Date.parse(branch.lastCommitDate) : 0;
}

export function sortBranchesForDisplay(branches: BranchInfo[]): BranchInfo[] {
  return [...branches].sort((a, b) => {
    const aTime = getBranchTimestamp(a);
    const bTime = getBranchTimestamp(b);
    if (aTime !== bTime) return bTime - aTime;
    return a.name.localeCompare(b.name);
  });
}

export function formatBranchLabel(name: string): string {
  const slashIndex = name.indexOf('/');
  return slashIndex >= 0 ? name.slice(slashIndex + 1) : name;
}

export function groupRemoteBranches(
  remoteBranches: BranchInfo[],
  remotes: RemoteInfo[],
): RemoteBranchGroup[] {
  const hostByRemote = new Map(remotes.map((remote) => [remote.name, extractHostname(remote.fetchUrl)]));
  const groups = new Map<string, BranchInfo[]>();

  for (const branch of sortBranchesForDisplay(remoteBranches)) {
    const remoteName = branch.name.split('/')[0] ?? 'remote';
    const existing = groups.get(remoteName) ?? [];
    existing.push(branch);
    groups.set(remoteName, existing);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, branches]) => ({
      name,
      host: hostByRemote.get(name) ?? '',
      branches,
    }));
}

function extractHostname(url: string): string {
  try {
    if (url.startsWith('git@')) {
      return url.split(':')[0]?.replace('git@', '') ?? url;
    }
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
