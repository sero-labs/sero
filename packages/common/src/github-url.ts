export interface ParsedGitHubRepo {
  owner: string;
  repo: string;
}

export function parseGitHubUrl(url: string): ParsedGitHubRepo | null {
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?$/);
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };

  const sshMatch = url.match(/github\.com:([^/]+)\/([^/\s]+?)(?:\.git)?$/);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

  return null;
}

export function normalizeGitHubRemoteUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;

  const trimmed = url.trim().replace(/\/+$/, '');
  const parsed = parseGitHubUrl(trimmed);
  if (!parsed) return undefined;

  return `https://github.com/${parsed.owner}/${parsed.repo}`;
}

export function toGitHubCloneUrl(url: string | null | undefined): string | undefined {
  const normalized = normalizeGitHubRemoteUrl(url);
  return normalized ? `${normalized}.git` : undefined;
}

export function extractGitHubRepoName(url: string | null | undefined): string | undefined {
  return parseGitHubUrl(url ?? '')?.repo;
}

export function extractGitHubUrl(text: string): string | undefined {
  const match = text.match(/https:\/\/github\.com\/[^\s,.)]+/);
  return match?.[0];
}

export function toGitHubWebUrl(url: string): string | undefined {
  const parsed = parseGitHubUrl(url);
  if (!parsed) return undefined;
  return `https://github.com/${parsed.owner}/${parsed.repo}`;
}

/**
 * Derive a workspace-friendly repository name from any git remote URL.
 *
 * Handles https/ssh/scp/self-hosted forms, e.g.
 *   https://github.com/octocat/Hello-World.git → "Hello-World"
 *   git@gitlab.com:group/sub/app.git           → "app"
 *   ssh://git@host:2222/team/repo              → "repo"
 * Returns undefined when no meaningful segment can be extracted.
 */
export function deriveRepoNameFromGitUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;

  const cleaned = url.trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
  // A repo name never contains '/' or ':', so the last such segment is the name.
  const lastSegment = cleaned.split(/[/:]/).filter(Boolean).pop();
  const name = lastSegment?.replace(/\.git$/i, '').trim();
  return name || undefined;
}
