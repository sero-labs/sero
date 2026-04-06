import { ipcRenderer, type IpcRendererEvent } from 'electron';
import { IpcChannels } from '../../src/types/ipc';
import { userFeedbackBridge } from './platform/user-feedback';
import {
  feedbackBridge,
  gatewayBridge,
  layoutBridge,
  netBridge,
  pluginConfigBridge,
  safeStorageBridge,
  themesBridge,
} from './platform/host-services';
import { debugBridge, lspBridge } from './editor/debug-lsp';
import { subagentBridge } from './agent/subagent';
import { skillsBridge } from './agent/skills';
import { promptsBridge } from './agent/prompts';
import { collaborationBridge } from './collaboration';
import { modelsBridge } from './agent/models';
import { localModelsBridge } from './agent/local-models';
import { googleBridge, imagegenBridge } from './integrations/google-imagegen';
import { modelConfigBridge, onboardingBridge } from './onboarding';
import {
  appStateBridge,
  appsBridge,
  appAgentBridge,
  gitAppBridge,
  appControlBridge,
  voiceBridge,
  authBridge,
  containerBridge,
  devServerBridge,
  githubBridge,
} from './apps/app-domain';
import { pluginsBridge } from './integrations/plugins';
import type {
  ProfileInfo,
  WorkspaceInfo,
  WorkspaceConfig,
  SeroSessionInfo,
  ChatMessage,
  AgentStreamEvent,
  SeroSlashCommandInfo,
  SeroAppManifest,
  SessionUsageStats,
  ContextUsageInfo,
  CompactResult,
  SessionModelState,
  AuthProvidersResponse,
  OAuthEvent,
  ContainerInfo,
  DevServer,
  DevServerEvent,
  SessionContext,
  ContextOverrides,
  ContextPreset,
  VoiceTranscriptionStatus,
  VoiceTranscriptionResult,
  ChatAttachment,
  AppControlEntry,
  AppInteractionParams,
  AppInteractionResult,
  AppPanelRect,
  AppRecordingStatus,
  AppRecordingResult,
  CreateGitHubRepoInput,
  CreateGitHubRepoResult,
} from '../../src/types/ipc';
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
} from '../../src/types/vcs';

export const seroPreloadApi = {
  platform: process.platform,
  shell: {
    showItemInFolder: (fullPath: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.shell.showItemInFolder, fullPath),
  },

  profiles: {
    list: (): Promise<ProfileInfo[]> =>
      ipcRenderer.invoke(IpcChannels.profiles.list),
    getActive: (): Promise<ProfileInfo | null> =>
      ipcRenderer.invoke(IpcChannels.profiles.getActive),
    hasActive: (): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannels.profiles.hasActive),
    create: (name: string, profilePath?: string, copyAuthFromId?: string): Promise<ProfileInfo> =>
      ipcRenderer.invoke(IpcChannels.profiles.create, name, profilePath, copyAuthFromId),
    switch: (id: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.profiles.switch, id),
    rename: (id: string, newName: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.profiles.rename, id, newName),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.profiles.delete, id),
    pickFolder: (): Promise<string | null> =>
      ipcRenderer.invoke(IpcChannels.profiles.pickFolder),
    needsOnboarding: (): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannels.profiles.needsOnboarding),
    markOnboardingDone: (): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.profiles.markOnboardingDone),
    listAuthSources: (): Promise<ProfileInfo[]> =>
      ipcRenderer.invoke(IpcChannels.profiles.listAuthSources),
  },

  workspace: {
    list: (): Promise<WorkspaceInfo[]> =>
      ipcRenderer.invoke(IpcChannels.workspace.list),

    create: (name: string, parentPath?: string): Promise<WorkspaceInfo> =>
      ipcRenderer.invoke(IpcChannels.workspace.create, name, parentPath),

    remove: (id: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.workspace.remove, id),

    getConfig: (id: string): Promise<WorkspaceConfig | null> =>
      ipcRenderer.invoke(IpcChannels.workspace.getConfig, id),

    addFolder: (folderPath: string, name?: string): Promise<WorkspaceInfo> =>
      ipcRenderer.invoke(IpcChannels.workspace.addFolder, folderPath, name),

    open: (id: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.workspace.open, id),

    close: (id: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.workspace.close, id),

    pickFolder: (): Promise<string | null> =>
      ipcRenderer.invoke(IpcChannels.workspace.pickFolder),

    infer: (message: string): Promise<string> =>
      ipcRenderer.invoke(IpcChannels.workspace.infer, message),

    setContainer: (id: string, enabled: boolean): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.workspace.setContainer, id, enabled),

    addReference: (id: string, refId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.workspace.addReference, id, refId),

    removeReference: (id: string, refId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.workspace.removeReference, id, refId),

    addMount: (id: string, folderPath: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.workspace.addMount, id, folderPath),

    removeMount: (id: string, folderPath: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.workspace.removeMount, id, folderPath),

    setExpanded: (id: string, expanded: boolean): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.workspace.setExpanded, id, expanded),
  },

  sessions: {
    list: (workspaceId?: string): Promise<SeroSessionInfo[]> =>
      ipcRenderer.invoke(IpcChannels.sessions.list, workspaceId),
    create: (workspaceId?: string): Promise<SeroSessionInfo> =>
      ipcRenderer.invoke(IpcChannels.sessions.create, workspaceId),
    delete: (sessionPath: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.sessions.delete, sessionPath),
    rename: (sessionId: string, name: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.sessions.rename, sessionId, name),
  },

  agent: {
    open: (sessionId: string, sessionPath: string, workspaceId: string): Promise<ChatMessage[]> =>
      ipcRenderer.invoke(IpcChannels.agent.open, sessionId, sessionPath, workspaceId),

    prompt: (
      sessionId: string,
      text: string,
      attachments?: ChatAttachment[],
      clientMessageId?: string,
    ): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.agent.prompt, sessionId, text, attachments, clientMessageId),

    steer: (
      sessionId: string,
      text: string,
      clientMessageId?: string,
    ): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.agent.steer, sessionId, text, clientMessageId),

    abort: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.agent.abort, sessionId),

    close: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.agent.close, sessionId),

    notifySessionSwitch: (previousSessionId: string, reason?: 'new' | 'resume'): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.agent.notifySessionSwitch, previousSessionId, reason),

    getCommands: (sessionId: string): Promise<SeroSlashCommandInfo[]> =>
      ipcRenderer.invoke(IpcChannels.agent.getCommands, sessionId),

    reloadResources: (sessionId: string): Promise<SeroSlashCommandInfo[]> =>
      ipcRenderer.invoke(IpcChannels.agent.reloadResources, sessionId),

    getUsage: (sessionId: string): Promise<SessionUsageStats | null> =>
      ipcRenderer.invoke(IpcChannels.agent.getUsage, sessionId),

    getContextUsage: (sessionId: string): Promise<ContextUsageInfo | null> =>
      ipcRenderer.invoke(IpcChannels.agent.getContextUsage, sessionId),

    compact: (sessionId: string, customInstructions?: string): Promise<CompactResult> =>
      ipcRenderer.invoke(IpcChannels.agent.compact, sessionId, customInstructions),

    clearSession: (sessionId: string): Promise<ChatMessage[]> =>
      ipcRenderer.invoke(IpcChannels.agent.clearSession, sessionId),

    forkSession: (sessionId: string): Promise<SeroSessionInfo> =>
      ipcRenderer.invoke(IpcChannels.agent.forkSession, sessionId),

    getModelState: (sessionId: string): Promise<SessionModelState | null> =>
      ipcRenderer.invoke(IpcChannels.agent.getModelState, sessionId),

    setModel: (sessionId: string, provider: string, modelId: string): Promise<SessionModelState> =>
      ipcRenderer.invoke(IpcChannels.agent.setModel, sessionId, provider, modelId),

    setThinkingLevel: (sessionId: string, level: string): Promise<SessionModelState> =>
      ipcRenderer.invoke(IpcChannels.agent.setThinkingLevel, sessionId, level),

    getContext: (sessionId: string): Promise<SessionContext | null> =>
      ipcRenderer.invoke(IpcChannels.agent.getContext, sessionId),

    setContextOverrides: (sessionId: string, overrides: ContextOverrides | null): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.agent.setContextOverrides, sessionId, overrides),

    restoreToCheckpoint: (sessionId: string, changeId: string): Promise<ChatMessage[]> =>
      ipcRenderer.invoke(IpcChannels.agent.restoreToCheckpoint, sessionId, changeId),

    onEvent: (callback: (event: AgentStreamEvent) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: AgentStreamEvent) => {
        callback(data);
      };
      ipcRenderer.on(IpcChannels.agent.event, handler);
      return () => {
        ipcRenderer.removeListener(IpcChannels.agent.event, handler);
      };
    },
  },

  contextPresets: {
    load: (): Promise<ContextPreset[]> =>
      ipcRenderer.invoke(IpcChannels.contextPresets.load),

    save: (presets: ContextPreset[]): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.contextPresets.save, presets),
  },

  appState: appStateBridge,

  apps: appsBridge,

  appAgent: appAgentBridge,

  gitApp: gitAppBridge,

  appControl: appControlBridge,

  models: modelsBridge,
  localModels: localModelsBridge,

  modelConfig: modelConfigBridge,
  onboarding: onboardingBridge,

  google: googleBridge,
  imagegen: imagegenBridge,
  pluginConfig: pluginConfigBridge,

  voice: voiceBridge,

  auth: authBridge,

  container: containerBridge,

  devServer: devServerBridge,

  vcs: {
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
    watch: (workspaceId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.vcs.watch, workspaceId),
    unwatch: (workspaceId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.vcs.unwatch, workspaceId),
    onEvent: (callback: (event: VcsEvent) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: VcsEvent) => {
        callback(data);
      };
      ipcRenderer.on(IpcChannels.vcs.event, handler);
      return () => {
        ipcRenderer.removeListener(IpcChannels.vcs.event, handler);
      };
    },

    // ── Rich VCS ops ──────────────────────────────────────────
    logEntries: (wsId: string, limit?: number, revset?: string): Promise<ChangeEntry[]> =>
      ipcRenderer.invoke(IpcChannels.vcs.logEntries, wsId, limit, revset),
    status: (wsId: string): Promise<WorkingCopyStatus> =>
      ipcRenderer.invoke(IpcChannels.vcs.status, wsId),
    fileDiffSummary: (wsId: string, from: string, to?: string): Promise<FileDiffEntry[]> =>
      ipcRenderer.invoke(IpcChannels.vcs.fileDiffSummary, wsId, from, to),
    fileContent: (wsId: string, rev: string, path: string): Promise<string> =>
      ipcRenderer.invoke(IpcChannels.vcs.fileContent, wsId, rev, path),
    describe: (wsId: string, changeId: string, msg: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.vcs.describe, wsId, changeId, msg),
    bookmarks: (wsId: string): Promise<Bookmark[]> =>
      ipcRenderer.invoke(IpcChannels.vcs.bookmarks, wsId),
    createBookmark: (wsId: string, name: string, rev?: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.vcs.createBookmark, wsId, name, rev),
    deleteBookmark: (wsId: string, name: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.vcs.deleteBookmark, wsId, name),
    moveBookmark: (wsId: string, name: string, toRev: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.vcs.moveBookmark, wsId, name, toRev),
    remotes: (wsId: string): Promise<Remote[]> =>
      ipcRenderer.invoke(IpcChannels.vcs.remotes, wsId),
    addRemote: (wsId: string, name: string, url: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.vcs.addRemote, wsId, name, url),
    setRemoteUrl: (wsId: string, name: string, url: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.vcs.setRemoteUrl, wsId, name, url),
    removeRemote: (wsId: string, name: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.vcs.removeRemote, wsId, name),
    fetch: (wsId: string, remote?: string): Promise<SyncResult> =>
      ipcRenderer.invoke(IpcChannels.vcs.fetch, wsId, remote),
    push: (wsId: string, bookmark?: string, changeId?: string): Promise<SyncResult> =>
      ipcRenderer.invoke(IpcChannels.vcs.push, wsId, bookmark, changeId),
    pushDryRun: (wsId: string, bookmark?: string, changeId?: string): Promise<PushPreview> =>
      ipcRenderer.invoke(IpcChannels.vcs.pushDryRun, wsId, bookmark, changeId),
    prState: (wsId: string): Promise<PullRequestState> =>
      ipcRenderer.invoke(IpcChannels.vcs.prState, wsId),
    prPreview: (wsId: string, sourceBranch?: string, targetBranch?: string): Promise<PullRequestPreview> =>
      ipcRenderer.invoke(IpcChannels.vcs.prPreview, wsId, sourceBranch, targetBranch),
    prGenerateDraft: (wsId: string, sourceBranch: string, targetBranch?: string): Promise<PullRequestDraft> =>
      ipcRenderer.invoke(IpcChannels.vcs.prGenerateDraft, wsId, sourceBranch, targetBranch),
    prCreate: (wsId: string, input: CreatePullRequestInput): Promise<CreatePullRequestResult> =>
      ipcRenderer.invoke(IpcChannels.vcs.prCreate, wsId, input),
    undo: (wsId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.vcs.undo, wsId),
    abandon: (wsId: string, changeId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.vcs.abandon, wsId, changeId),
    squash: (wsId: string, from?: string, into?: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.vcs.squash, wsId, from, into),
    opLog: (wsId: string, limit?: number): Promise<OperationEntry[]> =>
      ipcRenderer.invoke(IpcChannels.vcs.opLog, wsId, limit),
  },

  github: githubBridge,

  plugins: pluginsBridge,

  terminal: {
    create: (workspaceId: string, terminalId: string, cols?: number, rows?: number): Promise<void> =>
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
      const handler = (_event: Electron.IpcRendererEvent, terminalId: string, data: string) => {
        callback(terminalId, data);
      };
      ipcRenderer.on(IpcChannels.terminal.data, handler);
      return () => {
        ipcRenderer.removeListener(IpcChannels.terminal.data, handler);
      };
    },

    onExit: (callback: (terminalId: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, terminalId: string) => {
        callback(terminalId);
      };
      ipcRenderer.on(IpcChannels.terminal.exit, handler);
      return () => {
        ipcRenderer.removeListener(IpcChannels.terminal.exit, handler);
      };
    },
  },

  layout: layoutBridge,
  themes: themesBridge,
  net: netBridge,
  safeStorage: safeStorageBridge,
  gateway: gatewayBridge,
  feedback: feedbackBridge,

  collaboration: collaborationBridge,

  subagent: subagentBridge,
  skills: skillsBridge,
  prompts: promptsBridge,

  userFeedback: userFeedbackBridge,

  editor: {
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
    saveState: (workspaceId: string, state: { openTabs: string[]; activeTab: string | null }): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.editor.saveState, workspaceId, state),
    loadState: (workspaceId: string) =>
      ipcRenderer.invoke(IpcChannels.editor.loadState, workspaceId),
    getRootPath: (workspaceId: string): Promise<string> =>
      ipcRenderer.invoke(IpcChannels.editor.getRootPath, workspaceId),
    isContainer: (workspaceId: string): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannels.editor.isContainer, workspaceId),
    rename: (wId: string, o: string, n: string): Promise<boolean> => ipcRenderer.invoke(IpcChannels.editor.rename, wId, o, n),
    delete: (wId: string, p: string): Promise<boolean> => ipcRenderer.invoke(IpcChannels.editor.delete, wId, p),
    createFile: (wId: string, p: string): Promise<boolean> => ipcRenderer.invoke(IpcChannels.editor.createFile, wId, p),
    createDir: (wId: string, p: string): Promise<boolean> => ipcRenderer.invoke(IpcChannels.editor.createDir, wId, p),
  },

  filetree: {
    watch: (wId: string): Promise<void> => ipcRenderer.invoke(IpcChannels.filetree.watch, wId),
    unwatch: (wId: string): Promise<void> => ipcRenderer.invoke(IpcChannels.filetree.unwatch, wId),
    onChanged: (cb: (d: { workspaceId: string; directories: string[] }) => void): (() => void) => {
      const h = (_e: IpcRendererEvent, d: { workspaceId: string; directories: string[] }) => cb(d);
      ipcRenderer.on(IpcChannels.filetree.changed, h);
      return () => { ipcRenderer.removeListener(IpcChannels.filetree.changed, h); };
    },
  },

  debug: debugBridge,
  lsp: lspBridge,
};
