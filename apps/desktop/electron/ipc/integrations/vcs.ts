import path from 'node:path';

import { ipcMain } from 'electron';

import { IpcChannels } from '@/types/ipc-channels';
import type { CreatePullRequestInput, PullRequestDraft } from '@sero-ai/common';
import { runAdhocAgent } from '@electron/features/agent/assistants/adhoc-agent';
import { buildPrDraftPrompt, parseDraft } from '@electron/features/agent/assistants/pr-draft';
import { githubAuth, githubRepoOps, runtimeManager, vcsManager, vcsOps, vcsPrOps, workspaceManager } from '@electron/shared/infra/shared-infra';
import { connectRemote, publishRepo } from '@electron/features/git/remote-connect';
import type { PublishRepoInput, RemoteImportMode } from '@sero-ai/common';
import { gitWorkspaceStateManager } from '@electron/features/apps/git-app/manager';
import { ghForPath } from '@electron/features/git/github/invoker';
import { listOpenIssues, listOpenPullRequests } from '@electron/features/git/github/pull-requests';
import { getWorktreeDiffStat } from '@electron/features/git/worktree/git';
import { broadcastToWindows } from '../lib/window-broadcast';

const Ch = IpcChannels.vcs;

function broadcast(event: unknown): void {
  broadcastToWindows(Ch.event, event);
}

function invalidateGitFromVcsEvent(event: unknown): void {
  if (!event || typeof event !== 'object' || !('workspaceId' in event)) return;
  const workspaceId = typeof event.workspaceId === 'string' ? event.workspaceId : null;
  if (!workspaceId) return;

  const type = 'type' in event && typeof event.type === 'string' ? event.type : '';
  if (type === 'checkpoint_created' || type === 'restored') {
    gitWorkspaceStateManager.invalidateWorkspace(workspaceId, `vcs:${type}`);
  }
}

let subscribed = false;

export function registerVcsHandlers(): void {
  if (!subscribed) {
    subscribed = true;
    vcsManager.on('event', (event) => {
      invalidateGitFromVcsEvent(event);
      broadcast(event);
    });
  }

  // ── Existing checkpoint handlers ──────────────────────────

  ipcMain.handle(Ch.list, async (_e, wsId: string, limit?: number) =>
    vcsManager.listCheckpoints(wsId, limit ?? 40),
  );

  ipcMain.handle(Ch.state, async (_e, wsId: string, limit?: number) =>
    vcsManager.getWorkspaceState(wsId, limit ?? 40),
  );

  ipcMain.handle(Ch.create, async (_e, wsId: string, desc?: string, src?: string) =>
    vcsManager.createCheckpoint(wsId, { source: (src as 'manual') ?? 'manual', description: desc }),
  );

  ipcMain.handle(Ch.restore, async (_e, wsId: string, id: string) =>
    vcsManager.restoreCheckpoint(wsId, id),
  );

  ipcMain.handle(Ch.diff, async (_e, wsId: string, from: string, to?: string) =>
    vcsManager.diff(wsId, from, to),
  );

  // ── Rich VCS ops ──────────────────────────────────────────

  ipcMain.handle(Ch.logEntries, async (_e, wsId: string, limit?: number, revset?: string) =>
    vcsOps.getLogEntries(wsId, limit ?? 40, revset),
  );

  ipcMain.handle(Ch.fileDiffSummary, async (_e, wsId: string, from: string, to?: string) =>
    vcsOps.getFileDiffSummary(wsId, from, to),
  );

  ipcMain.handle(Ch.fileContent, async (_e, wsId: string, rev: string, path: string) =>
    vcsOps.getFileContent(wsId, rev, path),
  );

  ipcMain.handle(Ch.amendMessage, async (_e, wsId: string, sha: string, msg: string) =>
    vcsOps.amendCommitMessage(wsId, sha, msg),
  );

  ipcMain.handle(Ch.createBranch, async (_e, wsId: string, name: string, rev?: string) =>
    vcsOps.createBranch(wsId, name, rev),
  );

  ipcMain.handle(Ch.deleteBranch, async (_e, wsId: string, name: string) =>
    vcsOps.deleteBranch(wsId, name),
  );

  ipcMain.handle(Ch.moveBranch, async (_e, wsId: string, name: string, toRev: string) =>
    vcsOps.moveBranch(wsId, name, toRev),
  );

  ipcMain.handle(Ch.remotes, async (_e, wsId: string) =>
    vcsOps.listRemotes(wsId),
  );

  ipcMain.handle(Ch.addRemote, async (_e, wsId: string, name: string, url: string) =>
    vcsOps.addRemote(wsId, name, url),
  );

  ipcMain.handle(Ch.setRemoteUrl, async (_e, wsId: string, name: string, url: string) =>
    vcsOps.setRemoteUrl(wsId, name, url),
  );

  ipcMain.handle(Ch.removeRemote, async (_e, wsId: string, name: string) =>
    vcsOps.removeRemote(wsId, name),
  );

  ipcMain.handle(Ch.checkoutRemote, async (_e, wsId: string, remote?: string) => {
    const result = await vcsOps.checkoutRemote(wsId, remote);
    if (result.success) {
      const refresh = await gitWorkspaceStateManager.refreshWorkspace(wsId);
      if (!refresh.ok) {
        gitWorkspaceStateManager.invalidateWorkspace(wsId, 'vcs:checkout-remote');
      }
      broadcastToWindows(IpcChannels.filetree.changed, {
        workspaceId: wsId,
        directories: ['/workspace'],
      });
    }
    return result;
  });

  ipcMain.handle(Ch.connectRemote, async (_e, wsId: string, url: string, importMode?: RemoteImportMode) => {
    const result = await connectRemote(
      { vcsOps, githubRepoOps, githubAuth, runtimeManager },
      wsId,
      url,
      importMode,
    );
    if (result.ok && result.import.imported) {
      const refresh = await gitWorkspaceStateManager.refreshWorkspace(wsId);
      if (!refresh.ok) {
        gitWorkspaceStateManager.invalidateWorkspace(wsId, 'vcs:connect-remote');
      }
      broadcastToWindows(IpcChannels.filetree.changed, {
        workspaceId: wsId,
        directories: ['/workspace'],
      });
    }
    return result;
  });

  ipcMain.handle(Ch.publishRepo, async (_e, wsId: string, input: PublishRepoInput) => {
    const result = await publishRepo(
      { vcsOps, githubRepoOps, githubAuth, runtimeManager },
      wsId,
      input,
    );
    if (result.ok) {
      gitWorkspaceStateManager.invalidateWorkspace(wsId, 'vcs:publish-repo');
    }
    return result;
  });

  ipcMain.handle(Ch.fetch, async (_e, wsId: string, remote?: string) =>
    vcsOps.fetch(wsId, remote),
  );

  ipcMain.handle(Ch.push, async (_e, wsId: string, branch?: string, sha?: string) =>
    vcsOps.push(wsId, branch, sha),
  );

  // ── Pull request workflow ────────────────────────────────

  ipcMain.handle(Ch.prState, async (_e, wsId: string) =>
    vcsPrOps.getState(wsId),
  );

  ipcMain.handle(Ch.prPreview, async (_e, wsId: string, sourceBranch?: string, targetBranch?: string) =>
    vcsPrOps.preview(wsId, sourceBranch, targetBranch),
  );

  ipcMain.handle(Ch.prGenerateDraft, async (_e, wsId: string, sourceBranch: string, targetBranch?: string) => {
    const workspacePath = workspaceManager.getPath(wsId);
    if (!workspacePath) throw new Error(`Workspace not found: ${wsId}`);

    const ctx = await vcsPrOps.buildDraftContext(wsId, sourceBranch, targetBranch);
    const generated = await runAdhocAgent(
      workspacePath,
      buildPrDraftPrompt(ctx.fileSummary, ctx.patch),
      'low',
    );
    const parsed = parseDraft(generated.text);

    const draft: PullRequestDraft = {
      ...ctx.preview,
      title: parsed.title,
      body: parsed.body,
      model: generated.model,
    };
    return draft;
  });

  ipcMain.handle(Ch.prCreate, async (_e, wsId: string, input: CreatePullRequestInput) =>
    vcsPrOps.create(wsId, input),
  );

  ipcMain.handle(Ch.undo, async (_e, wsId: string) => vcsOps.undoLastCommit(wsId));

  ipcMain.handle(Ch.discardCommit, async (_e, wsId: string, sha: string) =>
    vcsOps.discardCommit(wsId, sha),
  );

  // Explicit refresh of the pushed repo-state cache. The file watchers cover
  // most changes, but manual sync mode (or a missed event) needs this seam so
  // the Refresh button and post-mutation reloads never show stale state.
  ipcMain.handle(Ch.refreshState, async (_e, wsId: string) =>
    gitWorkspaceStateManager.refreshWorkspace(wsId).catch((error: unknown) => ({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    })),
  );

  // ── Repo-scoped gh reads (Agent Board) ────────────────────
  // Fail-soft to [] inside the helpers; a workspace without a GitHub remote
  // or gh auth simply contributes nothing.

  ipcMain.handle(Ch.issues, async (_e, wsId: string) => {
    const workspacePath = workspaceManager.getPath(wsId);
    return workspacePath ? listOpenIssues(ghForPath(workspacePath)) : [];
  });

  ipcMain.handle(Ch.openPrs, async (_e, wsId: string) => {
    const workspacePath = workspaceManager.getPath(wsId);
    return workspacePath ? listOpenPullRequests(ghForPath(workspacePath)) : [];
  });

  ipcMain.handle(Ch.diffStat, async (_e, checkoutPath: string) => {
    // Renderer-supplied path: only serve checkouts inside a registered
    // workspace (the root itself or a worktree under it, e.g. .sero/worktrees).
    const resolved = path.resolve(checkoutPath);
    const roots = (await workspaceManager.list()).map((ws) => ws.path);
    const known = roots.some((root) => resolved === root || resolved.startsWith(root + path.sep));
    return known ? getWorktreeDiffStat(resolved) : null;
  });
}
