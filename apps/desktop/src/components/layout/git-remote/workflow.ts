import type { GitHubAuthStatus } from '@/types/electron-services';
import type { CreateGitHubRepoInput } from '@/types/ipc';

export type GitRemoteVisibility = CreateGitHubRepoInput['visibility'];

export interface GitRemoteOriginInfo {
  url: string;
  owner?: string;
  repo?: string;
}

interface ParsedGitHubRepo {
  owner: string;
  repo: string;
}

export type CreateGitHubOriginResult =
  | {
      ok: true;
      authStatus: GitHubAuthStatus;
      url: string;
    }
  | {
      ok: false;
      authStatus: GitHubAuthStatus;
      reason: 'auth' | 'api' | 'missing-url';
      message?: string;
      url?: string;
    };

export type ConnectOriginResult =
  | {
      ok: true;
      url: string;
      webUrl?: string;
      updatedExisting: boolean;
    }
  | {
      ok: false;
      message: string;
    };

export function parseGitHubUrl(url: string): ParsedGitHubRepo | null {
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?$/);
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };

  const sshMatch = url.match(/github\.com:([^/]+)\/([^/\s]+?)(?:\.git)?$/);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

  return null;
}

export function toOriginInfo(url: string): GitRemoteOriginInfo {
  const parsed = parseGitHubUrl(url);
  return { url, owner: parsed?.owner, repo: parsed?.repo };
}

export function displayOriginUrl(url: string): string {
  const githubRepo = parseGitHubUrl(url);
  if (githubRepo) return `${githubRepo.owner}/${githubRepo.repo}`;

  return url.replace(/^(https?:\/\/|git@)/, '').replace(/\.git$/, '');
}

export function defaultRepoName(workspaceName: string, workspaceId: string): string {
  const source = workspaceName.trim() || workspaceId;
  return (
    source
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'sero-workspace'
  );
}

export function toGitHubWebUrl(url: string): string | undefined {
  const githubRepo = parseGitHubUrl(url);
  if (!githubRepo) return undefined;

  return `https://github.com/${githubRepo.owner}/${githubRepo.repo}`;
}

export async function loadGitHubStatus(): Promise<GitHubAuthStatus> {
  try {
    return await window.sero.github.status();
  } catch {
    return { authenticated: false };
  }
}

export async function fetchOriginInfo(workspaceId: string): Promise<GitRemoteOriginInfo | null> {
  try {
    const remotes = await window.sero.vcs.remotes(workspaceId);
    const origin = remotes.find((remote) => remote.name === 'origin');
    return origin ? toOriginInfo(origin.url) : null;
  } catch {
    return null;
  }
}

export async function createGitHubOrigin({
  workspaceId,
  name,
  description,
  visibility,
}: {
  workspaceId: string;
  name: string;
  description?: string;
  visibility: GitRemoteVisibility;
}): Promise<CreateGitHubOriginResult> {
  const authStatus = await loadGitHubStatus();
  if (!authStatus.authenticated) {
    return { ok: false, authStatus, reason: 'auth' };
  }

  const result = await window.sero.github.createRepo(workspaceId, {
    name,
    description,
    visibility,
    addRemote: true,
  });

  const url = result.url ?? (authStatus.username ? `https://github.com/${authStatus.username}/${name}` : undefined);
  if (!result.success) {
    return {
      ok: false,
      authStatus,
      reason: 'api',
      message: result.message,
      url,
    };
  }

  if (!url) {
    return {
      ok: false,
      authStatus,
      reason: 'missing-url',
    };
  }

  return { ok: true, authStatus, url };
}

export async function connectOrigin({
  workspaceId,
  url,
}: {
  workspaceId: string;
  url: string;
}): Promise<ConnectOriginResult> {
  try {
    await window.sero.vcs.addRemote(workspaceId, 'origin', url);
    return { ok: true, url, webUrl: toGitHubWebUrl(url), updatedExisting: false };
  } catch (error) {
    const message = toErrorMessage(error, 'Failed to connect remote');
    if (!message.includes('already exists')) {
      return { ok: false, message };
    }
  }

  try {
    await window.sero.vcs.setRemoteUrl(workspaceId, 'origin', url);
    return { ok: true, url, webUrl: toGitHubWebUrl(url), updatedExisting: true };
  } catch (error) {
    return { ok: false, message: toErrorMessage(error, 'Failed to update remote URL') };
  }
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
