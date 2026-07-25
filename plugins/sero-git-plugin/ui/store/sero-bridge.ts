/**
 * The slice of `window.sero` the git store uses.
 *
 * AD-025 publishes no vcs hook in `@sero-ai/app-runtime` — the plugin owns the
 * renderer-side repo cache and calls the host bridge directly — so the shapes
 * it depends on are declared here rather than imported.
 */

import type {
  Branch,
  CommitEntry,
  CreatePullRequestResult,
  FileDiffEntry,
  PullRequestPreview,
  PullRequestState,
  Remote,
  VcsCheckpoint,
  VcsEvent,
  VcsWorkspaceState,
  WorkingCopyStatus,
} from '@sero-ai/common';

export type {
  Branch,
  CommitEntry,
  CreatePullRequestResult,
  FileDiffEntry,
  PullRequestPreview,
  PullRequestState,
  Remote,
  VcsCheckpoint,
  VcsEvent,
  VcsWorkspaceState,
  WorkingCopyStatus,
};

export interface SeroVcsBridge {
  getState(workspaceId: string, limit?: number): Promise<VcsWorkspaceState>;
  logEntries(workspaceId: string, limit?: number, range?: string): Promise<CommitEntry[]>;
  refreshState(workspaceId: string): Promise<void>;
  onEvent(callback: (event: VcsEvent) => void): () => void;
  createCheckpoint(workspaceId: string, description?: string, source?: VcsCheckpoint['source']): Promise<VcsCheckpoint | null>;
  restore(workspaceId: string, checkpointId: string): Promise<void>;
  amendMessage(workspaceId: string, sha: string, msg: string): Promise<void>;
  createBranch(workspaceId: string, name: string, rev?: string): Promise<void>;
  deleteBranch(workspaceId: string, name: string): Promise<void>;
  moveBranch(workspaceId: string, name: string, toRev: string): Promise<void>;
  addRemote(workspaceId: string, name: string, url: string): Promise<void>;
  removeRemote(workspaceId: string, name: string): Promise<void>;
  fetch(workspaceId: string, remote?: string): Promise<{ success: boolean; message: string }>;
  push(workspaceId: string, branch?: string, checkpointId?: string): Promise<{ success: boolean; message: string }>;
  undo(workspaceId: string): Promise<void>;
  discardCommit(workspaceId: string, sha: string): Promise<void>;
  diff(workspaceId: string, fromRev: string, toRev?: string): Promise<string>;
  fileDiffSummary(workspaceId: string, from: string, to?: string): Promise<FileDiffEntry[]>;
  fileContent(workspaceId: string, rev: string, path: string): Promise<string>;

  // Pull requests — the Git app's right pane (§3).
  prState(workspaceId: string): Promise<PullRequestState>;
  prPreview(workspaceId: string, sourceBranch: string, targetBranch?: string): Promise<PullRequestPreview>;
  prGenerateDraft(workspaceId: string, sourceBranch: string, targetBranch?: string): Promise<PullRequestPreview & { title: string; body: string; model: string }>;
  prCreate(workspaceId: string, input: {
    sourceBranch: string;
    targetBranch: string;
    title: string;
    body: string;
  }): Promise<CreatePullRequestResult>;
}

/** Signing in to GitHub is a host concern; the Git app only reads and triggers it. */
export interface SeroGitHubBridge {
  status(): Promise<{ authenticated: boolean; username?: string; scopes?: string }>;
  login(): Promise<void>;
  onEvent(callback: (event: { type: 'code' | 'polling' | 'success' | 'error' }) => void): () => void;
}

export interface SeroAppStateBridge {
  watch<T = unknown>(filePath: string): Promise<T>;
  unwatch(filePath: string): Promise<void>;
  onChange<T = unknown>(cb: (filePath: string, data: T) => void): () => void;
}

interface SeroGitWindow {
  vcs: SeroVcsBridge;
  appState: SeroAppStateBridge;
  github?: SeroGitHubBridge;
}

/**
 * The GitHub bridge, if the host exposes one. Unlike git itself, signing in is
 * optional — the Git app works without it, minus pull requests — so this never
 * throws.
 */
export function seroGitHub(): SeroGitHubBridge | null {
  return (window as unknown as { sero?: Partial<SeroGitWindow> }).sero?.github ?? null;
}

export function seroBridge(): SeroGitWindow {
  const sero = (window as unknown as { sero?: Partial<SeroGitWindow> }).sero;
  if (!sero?.vcs || !sero.appState) {
    throw new Error('[git] window.sero is unavailable — the plugin must run inside Sero');
  }
  return sero as SeroGitWindow;
}
