/**
 * Window API types — workspace tools (editor, filetree, LSP, debug, VCS).
 *
 * Split from electron.d.ts to keep each file under 500 LOC.
 */

import type { EditorRoot, WorkspaceConfig, WorkspaceCreateOptions, WorkspaceInfo, WorkspaceRoot } from './ipc';
import type { WorkspaceRuntimeBackend, WorkspaceRuntimeConfig } from './workspace-runtime';
import type {
  BrowserPackProgressIPC,
  BrowserPackStatusIPC,
  ToolchainProgressIPC,
  ToolchainStatusIPC,
  WorkspaceAccessRootsResult,
  WorkspaceRuntimeDiagnosticsIPC,
} from '@sero-ai/common';
import type { LspNotification } from '@/lsp/lsp-protocol';
import type {
  ConflictOutcome,
  ConflictResolveInput,
} from '@electron/features/agent/assistants/conflict-resolve';
import type {
  VcsCheckpoint,
  VcsEvent,
  VcsWorkspaceState,
  CommitEntry,
  ConnectRemoteResult,
  PublishRepoInput,
  PublishRepoResult,
  RemoteImportMode,
  WorkingCopyStatus,
  FileDiffEntry,
  Branch,
  Remote,
  SyncResult,
  PullRequestState,
  PullRequestPreview,
  PullRequestDraft,
  CreatePullRequestInput,
  CreatePullRequestResult,
  GitActionResult,
  GitDiffStat,
  GitManagerRequest,
  AppRuntimeIssueSummary,
  AppRuntimePullRequestSummary,
  AppRuntimeCreateWorktreeCleanupPlanResult,
  AppRuntimeExecuteWorktreeCleanupPlanResult,
  AppRuntimeWorktreePoolStatusResult,
  OrchestratorBoardAction,
  OrchestratorBoardActionResult,
} from '@sero-ai/common';

export interface SeroWorkspaceAPI {
  /** List all registered workspaces (registry + config merged). */
  list(): Promise<WorkspaceInfo[]>;
  /** Create a new workspace. Optionally specify a parent directory for the workspace folder. */
  create(name: string, parentPath?: string, options?: WorkspaceCreateOptions): Promise<WorkspaceInfo>;
  /** Unregister a workspace (does not delete files). */
  remove(id: string): Promise<void>;
  /** Get full config for a workspace (.sero-workspace.json). */
  getConfig(id: string): Promise<WorkspaceConfig | null>;
  /** Register an existing folder as a workspace. Creates config if missing. */
  addFolder(folderPath: string, name?: string): Promise<WorkspaceInfo>;
  /** Expand workspace tree node (persisted). Also used by federated apps. */
  open(id: string): Promise<void>;
  /** Remove workspace from registry. Re-add via addFolder to restore. */
  close(id: string): Promise<void>;
  /** Delete a workspace: unregister AND permanently erase its folder from disk. Destructive. */
  delete(id: string): Promise<void>;
  /** Open native folder picker. Returns selected path or null. */
  pickFolder(): Promise<string | null>;
  /** Infer best workspace for a message. Returns workspace ID. */
  infer(message: string): Promise<string>;
  /** Inspect desired vs actual runtime state for one workspace or all workspaces. */
  getRuntimeDiagnostics(workspaceId?: string): Promise<WorkspaceRuntimeDiagnosticsIPC[]>;
  getToolchainStatus(): Promise<ToolchainStatusIPC>;
  ensureCoreTools(reason?: string): Promise<ToolchainStatusIPC>;
  onToolchainProgress(callback: (event: ToolchainProgressIPC) => void): () => void;
  getBrowserPackStatus(): Promise<BrowserPackStatusIPC>;
  ensureBrowserPack(reason?: string): Promise<BrowserPackStatusIPC>;
  uninstallBrowserPack(): Promise<BrowserPackStatusIPC>;
  onBrowserPackProgress(callback: (event: BrowserPackProgressIPC) => void): () => void;
  /** Read the persisted provider-aware runtime config. */
  getRuntimeConfig(id: string): Promise<WorkspaceRuntimeConfig>;
  /** Set provider-aware runtime backend and return refreshed workspace info. */
  setRuntimeBackend(id: string, backend: WorkspaceRuntimeBackend): Promise<WorkspaceInfo>;
  /**
   * Enable or disable container mode for a workspace.
   * @deprecated Use {@link setRuntimeBackend} — the boolean API cannot express
   * three-way runtime selection (host / docker / apple-container).
   */
  setContainer(id: string, enabled: boolean): Promise<void>;
  /** Add a workspace reference (mount another workspace into this one's runtime). */
  addReference(id: string, refId: string): Promise<void>;
  /** Remove a workspace reference. */
  removeReference(id: string, refId: string): Promise<void>;
  /** Mount an arbitrary host folder into this workspace's runtime. */
  addMount(id: string, folderPath: string): Promise<void>;
  /** Remove an arbitrary folder mount. */
  removeMount(id: string, folderPath: string): Promise<void>;
  /** Set expanded/collapsed state for a workspace tree node. */
  setExpanded(id: string, expanded: boolean): Promise<void>;
  /** List all roots for a workspace (primary + linked). */
  listRoots(id: string): Promise<WorkspaceRoot[]>;
  /** List bounded workspace access roots with host and runtime paths. */
  listAccessRoots(id: string): Promise<WorkspaceAccessRootsResult>;
  /** Add an additional root (folder or linked plugin) to a workspace. */
  addRoot(
    id: string,
    input: { name: string; path: string; kind?: WorkspaceRoot['kind'] },
  ): Promise<WorkspaceRoot>;
  /** Remove an additional root (cannot remove the primary). */
  removeRoot(id: string, rootId: string): Promise<void>;
  /** Rename an additional root. */
  renameRoot(id: string, rootId: string, newName: string): Promise<void>;
}

export interface SeroEditorAPI {
  /** Read a file from the workspace (dual-mode: container or host). */
  readFile(workspaceId: string, filePath: string): Promise<string>;
  /** Read a binary file as base64 (for media/document previews). */
  readBinaryFile(workspaceId: string, filePath: string): Promise<string>;
  /** Write a file to the workspace (dual-mode: container or host). */
  writeFile(workspaceId: string, filePath: string, content: string): Promise<void>;
  /** List files in a directory (dual-mode: container or host). */
  listFiles(workspaceId: string, dirPath: string): Promise<Array<{ name: string; type: 'file' | 'directory'; size: number }>>;
  /** Execute a shell command in the workspace (dual-mode). */
  exec(workspaceId: string, command: string): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  /** Save editor state (open tabs, active tab) for a workspace. */
  saveState(workspaceId: string, state: { openTabs: string[]; activeTab: string | null }): Promise<void>;
  /** Load editor state for a workspace. */
  loadState(workspaceId: string): Promise<{ openTabs: string[]; activeTab: string | null } | null>;
  /** Get the root path for the file tree (e.g. /workspace or host path). */
  getRootPath(workspaceId: string): Promise<string>;
  /** Get the list of editor roots (primary + linked) as virtual paths. */
  getRoots(workspaceId: string): Promise<EditorRoot[]>;
  /** Check if a workspace uses containers. */
  isContainer(workspaceId: string): Promise<boolean>;
  /** Rename/move a file or directory. Returns true on success. */
  rename(workspaceId: string, oldPath: string, newPath: string): Promise<boolean>;
  /** Delete a file or directory recursively. Returns true on success. */
  delete(workspaceId: string, itemPath: string): Promise<boolean>;
  /** Create an empty file. Returns true on success. */
  createFile(workspaceId: string, filePath: string): Promise<boolean>;
  /** Create a directory (recursive). Returns true on success. */
  createDir(workspaceId: string, dirPath: string): Promise<boolean>;
}

export interface SeroFileTreeAPI {
  /** Start watching a workspace directory for changes. */
  watch(workspaceId: string): Promise<void>;
  /** Stop watching a workspace directory. */
  unwatch(workspaceId: string): Promise<void>;
  /** Subscribe to file tree change events. Returns unsubscribe. */
  onChanged(callback: (data: { workspaceId: string; directories: string[] }) => void): () => void;
}

export interface SeroLspAPI {
  /** Start a language server for a workspace/language. */
  start(workspaceId: string, languageId: string): Promise<{ capabilities: Record<string, unknown>; language: string }>;
  /** Stop a language server. */
  stop(workspaceId: string, language: string): Promise<void>;
  /** Send an LSP request. */
  request(workspaceId: string, language: string, method: string, params?: unknown): Promise<unknown>;
  /** Send an LSP notification (fire-and-forget, no response). */
  notify(workspaceId: string, language: string, method: string, params?: unknown): void;
  /** Check if a server is running for a workspace/language. */
  hasServer(workspaceId: string, language: string): Promise<boolean>;
  /** Subscribe to LSP notifications (diagnostics etc.). Returns unsubscribe. */
  onNotification(callback: (data: { workspaceId: string; language: string; notification: LspNotification }) => void): () => void;
  /** Subscribe to LSP server stopped events. Returns unsubscribe. */
  onServerStopped(callback: (data: { workspaceId: string; language: string }) => void): () => void;
}

export interface SeroDebugAPI {
  /** Toggle debug logging on/off. Returns new enabled state. */
  toggle(): Promise<boolean>;
  /** Get current debug logging state. */
  getState(): Promise<boolean>;
  /** Open the log file in the native file explorer. */
  openLog(): Promise<void>;
  /** Clear the log file. */
  clearLog(): Promise<void>;
  /** Subscribe to debug state changes. Returns unsubscribe. */
  onStateChanged(callback: (enabled: boolean) => void): () => void;
}

export interface SeroVcsAPI {
  /** List recent checkpoints for a workspace. */
  listCheckpoints(workspaceId: string, limit?: number): Promise<VcsCheckpoint[]>;
  /** Get current workspace VCS state (current change + checkpoint list). */
  getState(workspaceId: string, limit?: number): Promise<VcsWorkspaceState>;
  /** Create a checkpoint for the workspace. */
  createCheckpoint(
    workspaceId: string,
    description?: string,
    source?: 'manual' | 'turn' | 'fs' | 'restore',
  ): Promise<VcsCheckpoint | null>;
  /** Restore files to a prior checkpoint snapshot. */
  restore(workspaceId: string, checkpointId: string): Promise<void>;
  /** Get a rich git-format diff between checkpoints. */
  diff(workspaceId: string, fromRev: string, toRev?: string): Promise<string>;
  /** Subscribe to VCS events. Returns unsubscribe. */
  onEvent(callback: (event: VcsEvent) => void): () => void;

  // ── Rich VCS ops ──────────────────────────────────────────
  logEntries(wsId: string, limit?: number, range?: string): Promise<CommitEntry[]>;
  fileDiffSummary(wsId: string, from: string, to?: string): Promise<FileDiffEntry[]>;
  fileContent(wsId: string, rev: string, path: string): Promise<string>;
  amendMessage(wsId: string, sha: string, msg: string): Promise<void>;
  createBranch(wsId: string, name: string, rev?: string): Promise<void>;
  deleteBranch(wsId: string, name: string): Promise<void>;
  moveBranch(wsId: string, name: string, toRev: string): Promise<void>;
  remotes(wsId: string): Promise<Remote[]>;
  addRemote(wsId: string, name: string, url: string): Promise<void>;
  setRemoteUrl(wsId: string, name: string, url: string): Promise<void>;
  removeRemote(wsId: string, name: string): Promise<void>;
  checkoutRemote(wsId: string, remote?: string): Promise<SyncResult>;
  connectRemote(wsId: string, url: string, importMode?: RemoteImportMode): Promise<ConnectRemoteResult>;
  publishRepo(wsId: string, input: PublishRepoInput): Promise<PublishRepoResult>;
  fetch(wsId: string, remote?: string): Promise<SyncResult>;
  push(wsId: string, branch?: string, sha?: string): Promise<SyncResult>;
  prState(wsId: string): Promise<PullRequestState>;
  prPreview(wsId: string, sourceBranch?: string, targetBranch?: string): Promise<PullRequestPreview>;
  prGenerateDraft(wsId: string, sourceBranch: string, targetBranch?: string): Promise<PullRequestDraft>;
  /** A drafted commit message for what is about to be committed. `''` means the model had nothing. */
  commitDraftMessage(wsId: string, scope?: 'staged' | 'all'): Promise<string>;
  /** Resolve one merge conflict — or ask about it, or decline it. Rejects on a malformed reply. */
  resolveConflictWithAi(wsId: string, input: ConflictResolveInput): Promise<ConflictOutcome>;
  prCreate(wsId: string, input: CreatePullRequestInput): Promise<CreatePullRequestResult>;
  undo(wsId: string): Promise<void>;
  discardCommit(wsId: string, sha: string): Promise<void>;
  /** Force a re-derive of the pushed repo-state cache (never rejects; failures come back as ok:false). */
  refreshState(wsId: string): Promise<{ ok: boolean; message: string }>;

  // ── Repo-scoped gh reads (Agent Board) — fail-soft to [] ──
  issues(wsId: string): Promise<AppRuntimeIssueSummary[]>;
  openPrs(wsId: string): Promise<AppRuntimePullRequestSummary[]>;
  /** Aggregate +adds −dels of a checkout's branch work vs its base. Null when not a repo. */
  diffStat(checkoutPath: string): Promise<GitDiffStat | null>;

  /**
   * Run one named git action — stage, commit, stash, switch branch (AD-025).
   * Resolves `{ ok: false, message }` when the action refused, rather than
   * throwing, so the caller can show the reason and stop.
   */
  run(workspaceId: string, params: GitManagerRequest): Promise<GitActionResult>;
}

export interface SeroOrchestratorAPI {
  /**
   * Route an Agent Board action to a workspace's orchestrator coordinator.
   * Fails with a clear error when the workspace has no coordinator loaded
   * (workspace not open) — the board renders that as "open workspace to act".
   */
  requestAction(
    workspaceId: string,
    action: OrchestratorBoardAction,
  ): Promise<OrchestratorBoardActionResult>;
}

export interface SeroWorktreePoolAPI {
  status(workspaceId: string): Promise<AppRuntimeWorktreePoolStatusResult>;
  createCleanupPlan(workspaceId: string): Promise<AppRuntimeCreateWorktreeCleanupPlanResult>;
  executeCleanupPlan(
    workspaceId: string,
    planId: string,
  ): Promise<AppRuntimeExecuteWorktreeCleanupPlanResult>;
}
