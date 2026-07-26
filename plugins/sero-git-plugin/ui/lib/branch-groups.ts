import type { BranchInfo, RemoteInfo } from '../../shared/types';

export interface RemoteBranchGroup {
  name: string;
  host: string;
  /** Where the remote lives on the web, when it can be worked out. */
  webUrl: string | null;
  branches: BranchInfo[];
}

/**
 * The browsable address behind a remote.
 *
 * Git remotes are given as `git@host:owner/repo.git` or as an https URL with a
 * `.git` suffix, and neither opens in a browser as it stands. Anything else —
 * a local path, an unrecognised scheme — has no web page, so it returns null
 * and the row simply is not clickable.
 */
export function remoteWebUrl(fetchUrl: string): string | null {
  const url = fetchUrl.trim();
  if (!url) return null;

  const ssh = /^(?:ssh:\/\/)?(?:git@)([^/:]+)[:/](.+?)(?:\.git)?\/?$/.exec(url);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;

  if (/^https?:\/\//.test(url)) return url.replace(/\.git\/?$/, '');

  return null;
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
  const byName = new Map(remotes.map((remote) => [remote.name, remote]));
  const groups = new Map<string, BranchInfo[]>();

  for (const branch of sortBranchesForDisplay(remoteBranches)) {
    const remoteName = branch.name.split('/')[0] ?? 'remote';
    const existing = groups.get(remoteName) ?? [];
    existing.push(branch);
    groups.set(remoteName, existing);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, branches]) => {
      const fetchUrl = byName.get(name)?.fetchUrl ?? '';
      return {
        name,
        host: fetchUrl ? extractHostname(fetchUrl) : '',
        webUrl: fetchUrl ? remoteWebUrl(fetchUrl) : null,
        branches,
      };
    });
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
