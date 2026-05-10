/**
 * Window API types — workspace tools (editor, filetree, LSP, debug, VCS).
 *
 * Split from electron.d.ts to keep each file under 500 LOC.
 */

import type { EditorRoot, WorkspaceConfig, WorkspaceInfo, WorkspaceRoot } from './ipc';
import type { WorkspaceRuntimeBackend, WorkspaceRuntimeConfig } from './workspace-runtime';
import type { WorkspaceRuntimeDiagnosticsIPC } from '@sero-ai/common';
import type { LspNotification } from '@/lsp/lsp-protocol';
import type {
  VcsCheckpoint,
  VcsEvent,
  VcsWorkspaceState,
  ChangeEntry,
  WorkingCopyStatus,
  FileDiffEntry,
  Bookmark,
  Remote,
  OperationEntry,
  SyncResult,
  PushPreview,
  PullRequestState,
  PullRequestPreview,
  PullRequestDraft,
  CreatePullRequestInput,
  CreatePullRequestResult,
} from '@sero-ai/common';

export interface SeroWorkspaceAPI {
  /** List all registered workspaces (registry + config merged). */
  list(): Promise<WorkspaceInfo[]>;
  /** Create a new workspace. Optionally specify a parent directory for the workspace folder. */
  create(name: string, parentPath?: string): Promise<WorkspaceInfo>;
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
  /** Open native folder picker. Returns selected path or null. */
  pickFolder(): Promise<string | null>;
  /** Infer best workspace for a message. Returns workspace ID. */
  infer(message: string): Promise<string>;
  /** Inspect desired vs actual runtime state for one workspace or all workspaces. */
  getRuntimeDiagnostics(workspaceId?: string): Promise<WorkspaceRuntimeDiagnosticsIPC[]>;
  /** Read the persisted provider-aware runtime config. */
  getRuntimeConfig(id: string): Promise<WorkspaceRuntimeConfig>;
  /** Set provider-aware runtime backend and return refreshed workspace info. */
  setRuntimeBackend(id: string, backend: WorkspaceRuntimeBackend): Promise<WorkspaceInfo>;
  /** Enable or disable container mode for a workspace. Deprecated compatibility API. */
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
  setRemoteUrl(wsId: string, name: string, url: string): Promise<void>;
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
