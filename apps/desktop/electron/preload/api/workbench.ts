import { ipcRenderer, type IpcRendererEvent } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type {
  AppRuntimeIssueSummary,
  AppRuntimePullRequestSummary,
  Bookmark,
  ChangeEntry,
  CreatePullRequestInput,
  CreatePullRequestResult,
  FileDiffEntry,
  GitDiffStat,
  PullRequestDraft,
  PullRequestPreview,
  PullRequestState,
  Remote,
  SyncResult,
  VcsCheckpoint,
  VcsEvent,
  VcsWorkspaceState,
  WorkingCopyStatus,
} from '@sero-ai/common';
import type { EditorRoot, TerminalCreateResult } from '@/types/ipc';

export const vcsBridge = {
  listCheckpoints: (workspaceId: string, limit?: number): Promise<VcsCheckpoint[]> =>
    ipcRenderer.invoke(IpcChannels.vcs.list, workspaceId, limit),
  getState: (workspaceId: string, limit?: number): Promise<VcsWorkspaceState> =>
    ipcRenderer.invoke(IpcChannels.vcs.state, workspaceId, limit),
  createCheckpoint: (
    workspaceId: string,
    description?: string,
    source?: 'manual' | 'turn' | 'fs' | 'restore',
  ): Promise<VcsCheckpoint | null> =>
    ipcRenderer.invoke(IpcChannels.vcs.create, workspaceId, description, source),
  restore: (workspaceId: string, checkpointId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.vcs.restore, workspaceId, checkpointId),
  diff: (workspaceId: string, fromChangeId: string, toChangeId?: string): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.vcs.diff, workspaceId, fromChangeId, toChangeId),
  onEvent: (callback: (event: VcsEvent) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: VcsEvent) => {
      callback(data);
    };
    ipcRenderer.on(IpcChannels.vcs.event, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.vcs.event, handler);
    };
  },
  logEntries: (workspaceId: string, limit?: number, revset?: string): Promise<ChangeEntry[]> =>
    ipcRenderer.invoke(IpcChannels.vcs.logEntries, workspaceId, limit, revset),
  status: (workspaceId: string): Promise<WorkingCopyStatus> =>
    ipcRenderer.invoke(IpcChannels.vcs.status, workspaceId),
  fileDiffSummary: (
    workspaceId: string,
    from: string,
    to?: string,
  ): Promise<FileDiffEntry[]> =>
    ipcRenderer.invoke(IpcChannels.vcs.fileDiffSummary, workspaceId, from, to),
  fileContent: (workspaceId: string, rev: string, path: string): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.vcs.fileContent, workspaceId, rev, path),
  describe: (workspaceId: string, changeId: string, msg: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.vcs.describe, workspaceId, changeId, msg),
  bookmarks: (workspaceId: string): Promise<Bookmark[]> =>
    ipcRenderer.invoke(IpcChannels.vcs.bookmarks, workspaceId),
  createBookmark: (workspaceId: string, name: string, rev?: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.vcs.createBookmark, workspaceId, name, rev),
  deleteBookmark: (workspaceId: string, name: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.vcs.deleteBookmark, workspaceId, name),
  moveBookmark: (workspaceId: string, name: string, toRev: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.vcs.moveBookmark, workspaceId, name, toRev),
  remotes: (workspaceId: string): Promise<Remote[]> =>
    ipcRenderer.invoke(IpcChannels.vcs.remotes, workspaceId),
  addRemote: (workspaceId: string, name: string, url: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.vcs.addRemote, workspaceId, name, url),
  setRemoteUrl: (workspaceId: string, name: string, url: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.vcs.setRemoteUrl, workspaceId, name, url),
  removeRemote: (workspaceId: string, name: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.vcs.removeRemote, workspaceId, name),
  checkoutRemote: (workspaceId: string, remote?: string): Promise<SyncResult> =>
    ipcRenderer.invoke(IpcChannels.vcs.checkoutRemote, workspaceId, remote),
  fetch: (workspaceId: string, remote?: string): Promise<SyncResult> =>
    ipcRenderer.invoke(IpcChannels.vcs.fetch, workspaceId, remote),
  push: (workspaceId: string, bookmark?: string, changeId?: string): Promise<SyncResult> =>
    ipcRenderer.invoke(IpcChannels.vcs.push, workspaceId, bookmark, changeId),
  prState: (workspaceId: string): Promise<PullRequestState> =>
    ipcRenderer.invoke(IpcChannels.vcs.prState, workspaceId),
  prPreview: (
    workspaceId: string,
    sourceBranch?: string,
    targetBranch?: string,
  ): Promise<PullRequestPreview> =>
    ipcRenderer.invoke(IpcChannels.vcs.prPreview, workspaceId, sourceBranch, targetBranch),
  prGenerateDraft: (
    workspaceId: string,
    sourceBranch: string,
    targetBranch?: string,
  ): Promise<PullRequestDraft> =>
    ipcRenderer.invoke(IpcChannels.vcs.prGenerateDraft, workspaceId, sourceBranch, targetBranch),
  prCreate: (
    workspaceId: string,
    input: CreatePullRequestInput,
  ): Promise<CreatePullRequestResult> =>
    ipcRenderer.invoke(IpcChannels.vcs.prCreate, workspaceId, input),
  undo: (workspaceId: string): Promise<void> => ipcRenderer.invoke(IpcChannels.vcs.undo, workspaceId),
  abandon: (workspaceId: string, changeId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.vcs.abandon, workspaceId, changeId),
  issues: (workspaceId: string): Promise<AppRuntimeIssueSummary[]> =>
    ipcRenderer.invoke(IpcChannels.vcs.issues, workspaceId),
  openPrs: (workspaceId: string): Promise<AppRuntimePullRequestSummary[]> =>
    ipcRenderer.invoke(IpcChannels.vcs.openPrs, workspaceId),
  diffStat: (checkoutPath: string): Promise<GitDiffStat | null> =>
    ipcRenderer.invoke(IpcChannels.vcs.diffStat, checkoutPath),
};

export const terminalBridge = {
  create: (
    workspaceId: string,
    terminalId: string,
    cols?: number,
    rows?: number,
  ): Promise<TerminalCreateResult> =>
    ipcRenderer.invoke(IpcChannels.terminal.create, workspaceId, terminalId, cols, rows),
  write: (terminalId: string, data: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.terminal.write, terminalId, data),
  resize: (terminalId: string, cols: number, rows: number): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.terminal.resize, terminalId, cols, rows),
  dispose: (terminalId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.terminal.dispose, terminalId),
  replay: (terminalId: string): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.terminal.replay, terminalId),
  onData: (callback: (terminalId: string, data: string) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, terminalId: string, data: string) => {
      callback(terminalId, data);
    };
    ipcRenderer.on(IpcChannels.terminal.data, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.terminal.data, handler);
    };
  },
  onExit: (callback: (terminalId: string) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, terminalId: string) => {
      callback(terminalId);
    };
    ipcRenderer.on(IpcChannels.terminal.exit, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.terminal.exit, handler);
    };
  },
};

export const editorBridge = {
  readFile: (workspaceId: string, filePath: string): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.editor.readFile, workspaceId, filePath),
  readBinaryFile: (workspaceId: string, filePath: string): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.editor.readBinaryFile, workspaceId, filePath),
  writeFile: (workspaceId: string, filePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.editor.writeFile, workspaceId, filePath, content),
  listFiles: (workspaceId: string, dirPath: string) =>
    ipcRenderer.invoke(IpcChannels.editor.listFiles, workspaceId, dirPath),
  exec: (workspaceId: string, command: string) =>
    ipcRenderer.invoke(IpcChannels.editor.exec, workspaceId, command),
  saveState: (
    workspaceId: string,
    state: { openTabs: string[]; activeTab: string | null },
  ): Promise<void> => ipcRenderer.invoke(IpcChannels.editor.saveState, workspaceId, state),
  loadState: (workspaceId: string) => ipcRenderer.invoke(IpcChannels.editor.loadState, workspaceId),
  getRootPath: (workspaceId: string): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.editor.getRootPath, workspaceId),
  getRoots: (workspaceId: string): Promise<EditorRoot[]> =>
    ipcRenderer.invoke(IpcChannels.editor.getRoots, workspaceId),
  isContainer: (workspaceId: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.editor.isContainer, workspaceId),
  rename: (workspaceId: string, oldPath: string, newPath: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.editor.rename, workspaceId, oldPath, newPath),
  delete: (workspaceId: string, path: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.editor.delete, workspaceId, path),
  createFile: (workspaceId: string, path: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.editor.createFile, workspaceId, path),
  createDir: (workspaceId: string, path: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.editor.createDir, workspaceId, path),
};

export const filetreeBridge = {
  watch: (workspaceId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.filetree.watch, workspaceId),
  unwatch: (workspaceId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.filetree.unwatch, workspaceId),
  onChanged: (
    callback: (data: { workspaceId: string; directories: string[] }) => void,
  ): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      data: { workspaceId: string; directories: string[] },
    ) => callback(data);
    ipcRenderer.on(IpcChannels.filetree.changed, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.filetree.changed, handler);
    };
  },
};
