/**
 * Remote connect / publish policy — the main-process owner of the flows the
 * renderer used to orchestrate (AD-024 / D5): upserting origin without
 * error-string matching, the import-into-empty-workspace policy, and
 * publishing a workspace to a new GitHub repo.
 */

import type {
  ConnectRemoteResult,
  PublishRepoInput,
  PublishRepoResult,
  RemoteImportMode,
  RemoteImportOutcome,
} from '@sero-ai/common';
import type { GitHubAuthManager } from '@electron/features/auth/github/auth-manager';
import type { GitHubRepoOps } from '@electron/features/git/github/repos';
import type { VcsOps } from '@electron/features/git/core/vcs-ops';
import type { RuntimeManager } from '@electron/features/workspace/runtime/runtime-manager';

/** Entries every workspace starts with — not "files" for the import policy. */
const WORKSPACE_SCAFFOLD_ENTRIES = new Set([
  '.git',
  '.sero',
  '.sero-workspace.json',
  '.DS_Store',
]);

export interface RemoteConnectDeps {
  vcsOps: VcsOps;
  githubRepoOps: GitHubRepoOps;
  githubAuth: GitHubAuthManager;
  runtimeManager: RuntimeManager;
}

/**
 * Connect (or re-point) the `origin` remote and apply the import policy in
 * one atomic main-side operation.
 */
export async function connectRemote(
  deps: RemoteConnectDeps,
  workspaceId: string,
  url: string,
  importMode: RemoteImportMode = 'never',
): Promise<ConnectRemoteResult> {
  let updatedExisting: boolean;
  try {
    const remotes = await deps.vcsOps.listRemotes(workspaceId);
    const hasOrigin = remotes.some((remote) => remote.name === 'origin');
    if (hasOrigin) {
      await deps.vcsOps.setRemoteUrl(workspaceId, 'origin', url);
      updatedExisting = true;
    } else {
      await deps.vcsOps.addRemote(workspaceId, 'origin', url);
      updatedExisting = false;
    }
  } catch (error) {
    return { ok: false, message: toMessage(error, 'Failed to connect remote') };
  }

  const outcome = await importRemote(deps, workspaceId, importMode);
  return { ok: true, url, updatedExisting, import: outcome };
}

async function importRemote(
  deps: RemoteConnectDeps,
  workspaceId: string,
  importMode: RemoteImportMode,
): Promise<RemoteImportOutcome> {
  if (importMode === 'never') return { imported: false, reason: 'link-only' };

  if (importMode === 'auto' && (await hasVisibleWorkspaceFiles(deps, workspaceId))) {
    return { imported: false, reason: 'workspace-not-empty' };
  }

  const checkout = await deps.vcsOps.checkoutRemote(workspaceId, 'origin');
  if (checkout.success) return { imported: true };

  console.warn('[remote-connect] Remote connected, but import failed:', checkout.message);
  return { imported: false, reason: 'import-failed', message: checkout.message };
}

async function hasVisibleWorkspaceFiles(
  deps: RemoteConnectDeps,
  workspaceId: string,
): Promise<boolean> {
  try {
    const runtime = await deps.runtimeManager.getRuntime(workspaceId);
    const entries = await runtime.listFiles({ path: runtime.runtimeWorkspacePath });
    return entries.some((entry) => !WORKSPACE_SCAFFOLD_ENTRIES.has(entry.name));
  } catch {
    return false;
  }
}

/** Create the GitHub repo, wire origin, and push — one main-side operation. */
export async function publishRepo(
  deps: RemoteConnectDeps,
  workspaceId: string,
  input: PublishRepoInput,
): Promise<PublishRepoResult> {
  if (!deps.githubAuth.getToken()) {
    return { ok: false, reason: 'auth' };
  }

  const result = await deps.githubRepoOps.createRepo(workspaceId, {
    name: input.name,
    description: input.description,
    visibility: input.visibility,
    addRemote: true,
  });

  if (!result.success) {
    return { ok: false, reason: 'api', message: result.message, url: result.url };
  }
  if (!result.url) {
    return { ok: false, reason: 'missing-url' };
  }
  return { ok: true, url: result.url };
}

function toMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
