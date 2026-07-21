/**
 * Display helpers + thin wrappers for the remote-connect/publish flows.
 * The policy (origin upsert, import-into-empty-workspace, repo publish)
 * lives in the main process (electron/features/vcs/remote-connect.ts);
 * this module only shapes results for the connect/publish UI.
 */

import type { GitHubAuthStatus } from '@/types/electron-services';
import type { CreateGitHubRepoInput } from '@/types/ipc';
import type { ConnectRemoteResult, RemoteImportMode, RemoteImportOutcome } from '@sero-ai/common';
import {
  parseGitHubUrl as parseSharedGitHubUrl,
  toGitHubWebUrl as toSharedGitHubWebUrl,
  type ParsedGitHubRepo,
} from '@sero-ai/common';
import { toErrorMessage } from '../error-utils';

export type GitRemoteVisibility = CreateGitHubRepoInput['visibility'];
export type ImportMode = RemoteImportMode;
export type ImportOutcome = RemoteImportOutcome;

export interface GitRemoteOriginInfo {
  url: string;
  owner?: string;
  repo?: string;
}

export type CreateGitHubOriginResult =
  | { ok: true; authStatus: GitHubAuthStatus; url: string }
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
      import: ImportOutcome;
    }
  | { ok: false; message: string };

export type FetchOriginInfoResult =
  | { ok: true; origin: GitRemoteOriginInfo | null }
  | { ok: false; message: string };

export function parseGitHubUrl(url: string): ParsedGitHubRepo | null {
  return parseSharedGitHubUrl(url);
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
  return toSharedGitHubWebUrl(url);
}

export async function loadGitHubStatus(): Promise<GitHubAuthStatus> {
  try {
    return await window.sero.github.status();
  } catch {
    return { authenticated: false };
  }
}

export async function fetchOriginInfo(workspaceId: string): Promise<FetchOriginInfoResult> {
  try {
    const remotes = await window.sero.vcs.remotes(workspaceId);
    const origin = remotes.find((remote) => remote.name === 'origin');
    return { ok: true, origin: origin ? toOriginInfo(origin.url) : null };
  } catch (error) {
    return {
      ok: false,
      message: toErrorMessage(error, 'Failed to load Git remotes for this workspace.'),
    };
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

  const result = await window.sero.vcs.publishRepo(workspaceId, { name, description, visibility });
  if (result.ok) return { ok: true, authStatus, url: result.url };
  return {
    ok: false,
    authStatus,
    reason: result.reason,
    message: result.message,
    url: result.url,
  };
}

export async function connectOrigin({
  workspaceId,
  url,
  importMode = 'never',
}: {
  workspaceId: string;
  url: string;
  importMode?: ImportMode;
}): Promise<ConnectOriginResult> {
  const result: ConnectRemoteResult = await window.sero.vcs.connectRemote(workspaceId, url, importMode);
  if (!result.ok) return result;
  return { ...result, webUrl: toGitHubWebUrl(result.url) };
}

/**
 * Human-readable summary of what happened to the working tree, or `null` when
 * there is nothing worth telling the user (a clean import or a plain link).
 */
export function describeImportOutcome(outcome: ImportOutcome): string | null {
  if (outcome.imported) return null;
  switch (outcome.reason) {
    case 'link-only':
      return null;
    case 'workspace-not-empty':
      return 'Remote linked. The workspace already has files, so nothing was imported.';
    case 'import-failed':
      return `Remote linked, but the files couldn't be imported: ${outcome.message ?? 'unknown error'}`;
  }
}
