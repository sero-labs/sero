/**
 * Window API types — workspace tools (editor, filetree, LSP, debug, VCS).
 *
 * Split from electron.d.ts to keep each file under 500 LOC.
 */

type VcsTypes = typeof import('./vcs');
type VcsCheckpoint = import('./vcs').VcsCheckpoint;
type VcsEvent = import('./vcs').VcsEvent;
type VcsWorkspaceState = import('./vcs').VcsWorkspaceState;
type ChangeEntry = import('./vcs').ChangeEntry;
type WorkingCopyStatus = import('./vcs').WorkingCopyStatus;
type FileDiffEntry = import('./vcs').FileDiffEntry;
type Bookmark = import('./vcs').Bookmark;
type Remote = import('./vcs').Remote;
type OperationEntry = import('./vcs').OperationEntry;
type SyncResult = import('./vcs').SyncResult;
type PushPreview = import('./vcs').PushPreview;
type PullRequestState = import('./vcs').PullRequestState;
type PullRequestPreview = import('./vcs').PullRequestPreview;
type PullRequestDraft = import('./vcs').PullRequestDraft;
type CreatePullRequestInput = import('./vcs').CreatePullRequestInput;
type CreatePullRequestResult = import('./vcs').CreatePullRequestResult;

interface SeroEditorAPI {
  /** Read a file from the workspace (dual-mode: container or host). */
  readFile(workspaceId: string, filePath: string): Promise<string>;
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

interface SeroFileTreeAPI {
  /** Start watching a workspace directory for changes. */
  watch(workspaceId: string): Promise<void>;
  /** Stop watching a workspace directory. */
  unwatch(workspaceId: string): Promise<void>;
  /** Subscribe to file tree change events. Returns unsubscribe. */
  onChanged(callback: (data: { workspaceId: string; directories: string[] }) => void): () => void;
}

interface SeroLspAPI {
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
  onNotification(callback: (data: { workspaceId: string; language: string; notification: any }) => void): () => void;
  /** Subscribe to LSP server stopped events. Returns unsubscribe. */
  onServerStopped(callback: (data: { workspaceId: string; language: string }) => void): () => void;
}

interface SeroDebugAPI {
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

interface SeroVcsAPI {
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
  diff(workspaceId: string, fromChangeId: string, toChangeId?: string): Promise<string>;
  /** Start workspace filesystem checkpoint watcher. */
  watch(workspaceId: string): Promise<void>;
  /** Stop workspace filesystem checkpoint watcher. */
  unwatch(workspaceId: string): Promise<void>;
  /** Subscribe to VCS events. Returns unsubscribe. */
  onEvent(callback: (event: VcsEvent) => void): () => void;

  // ── Rich VCS ops ──────────────────────────────────────────
  logEntries(wsId: string, limit?: number, revset?: string): Promise<ChangeEntry[]>;
  status(wsId: string): Promise<WorkingCopyStatus>;
  fileDiffSummary(wsId: string, from: string, to?: string): Promise<FileDiffEntry[]>;
  fileContent(wsId: string, rev: string, path: string): Promise<string>;
  describe(wsId: string, changeId: string, msg: string): Promise<void>;
  bookmarks(wsId: string): Promise<Bookmark[]>;
  createBookmark(wsId: string, name: string, rev?: string): Promise<void>;
  deleteBookmark(wsId: string, name: string): Promise<void>;
  moveBookmark(wsId: string, name: string, toRev: string): Promise<void>;
  remotes(wsId: string): Promise<Remote[]>;
  addRemote(wsId: string, name: string, url: string): Promise<void>;
  removeRemote(wsId: string, name: string): Promise<void>;
  fetch(wsId: string, remote?: string): Promise<SyncResult>;
  push(wsId: string, bookmark?: string, changeId?: string): Promise<SyncResult>;
  pushDryRun(wsId: string, bookmark?: string, changeId?: string): Promise<PushPreview>;
  prState(wsId: string): Promise<PullRequestState>;
  prPreview(wsId: string, sourceBranch?: string, targetBranch?: string): Promise<PullRequestPreview>;
  prGenerateDraft(wsId: string, sourceBranch: string, targetBranch?: string): Promise<PullRequestDraft>;
  prCreate(wsId: string, input: CreatePullRequestInput): Promise<CreatePullRequestResult>;
  undo(wsId: string): Promise<void>;
  abandon(wsId: string, changeId: string): Promise<void>;
  squash(wsId: string, from?: string, into?: string): Promise<void>;
  opLog(wsId: string, limit?: number): Promise<OperationEntry[]>;
}
