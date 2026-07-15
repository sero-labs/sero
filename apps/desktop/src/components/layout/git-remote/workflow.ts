import type { GitHubAuthStatus } from '@/types/electron-services';
import type { CreateGitHubRepoInput } from '@/types/ipc';
import {
  parseGitHubUrl as parseSharedGitHubUrl,
  toGitHubWebUrl as toSharedGitHubWebUrl,
  type ParsedGitHubRepo,
} from '@sero-ai/common';
import { toErrorMessage } from '../error-utils';

export type GitRemoteVisibility = CreateGitHubRepoInput['visibility'];

export interface GitRemoteOriginInfo {
  url: string;
  owner?: string;
  repo?: string;
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

/**
 * How much to import when connecting a remote:
 * - `never`  — record the remote only, touch no files (default).
 * - `auto`   — fetch + check out only when the workspace is empty (safe default for new workspaces).
 * - `force`  — attempt to fetch + check out even when files are present. The VCS
 *              layer refuses tracked history and path conflicts before checkout.
 */
export type ImportMode = 'never' | 'auto' | 'force';

/** What actually happened to the working tree when a remote was connected. */
export type ImportOutcome =
  | { imported: true }
  | {
      imported: false;
      /**
       * - `link-only`         — no import was requested.
       * - `workspace-not-empty` — auto import skipped because the workspace already has files.
       * - `import-failed`     — fetch/checkout ran but failed (e.g. path conflict, auth).
       */
      reason: 'link-only' | 'workspace-not-empty' | 'import-failed';
      message?: string;
    };

export type ConnectOriginResult =
  | {
      ok: true;
      url: string;
      webUrl?: string;
      updatedExisting: boolean;
      import: ImportOutcome;
    }
  | {
      ok: false;
      message: string;
    };

export type FetchOriginInfoResult =
  | {
      ok: true;
      origin: GitRemoteOriginInfo | null;
    }
  | {
      ok: false;
      message: string;
    };

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
  importMode = 'never',
}: {
  workspaceId: string;
  url: string;
  importMode?: ImportMode;
}): Promise<ConnectOriginResult> {
  let base: { url: string; webUrl?: string; updatedExisting: boolean };
  try {
    await window.sero.vcs.addRemote(workspaceId, 'origin', url);
    base = { url, webUrl: toGitHubWebUrl(url), updatedExisting: false };
  } catch (error) {
    const message = toErrorMessage(error, 'Failed to connect remote');
    if (!message.includes('already exists')) {
      return { ok: false, message };
    }
    try {
      await window.sero.vcs.setRemoteUrl(workspaceId, 'origin', url);
      base = { url, webUrl: toGitHubWebUrl(url), updatedExisting: true };
    } catch (setError) {
      return { ok: false, message: toErrorMessage(setError, 'Failed to update remote URL') };
    }
  }

  const outcome = await importRemote(workspaceId, importMode);
  return { ok: true, ...base, import: outcome };
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

async function importRemote(workspaceId: string, importMode: ImportMode): Promise<ImportOutcome> {
  if (importMode === 'never') return { imported: false, reason: 'link-only' };

  if (importMode === 'auto' && (await hasVisibleWorkspaceFiles(workspaceId))) {
    return { imported: false, reason: 'workspace-not-empty' };
  }

  const checkout = await window.sero.vcs.checkoutRemote(workspaceId, 'origin');
  if (checkout.success) return { imported: true };

  console.warn('[git-remote] Remote connected, but import failed:', checkout.message);
  return { imported: false, reason: 'import-failed', message: checkout.message };
}

async function hasVisibleWorkspaceFiles(workspaceId: string): Promise<boolean> {
  try {
    const entries = await window.sero.editor.listFiles(workspaceId, '/workspace');
    return entries.some((entry) => !isWorkspaceScaffoldFile(entry.name));
  } catch {
    return false;
  }
}

function isWorkspaceScaffoldFile(name: string): boolean {
  return name === '.git' || name === '.sero-workspace.json' || name === '.DS_Store';
}
