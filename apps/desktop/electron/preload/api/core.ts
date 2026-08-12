import { ipcRenderer, type IpcRendererEvent } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type {
  AgentStreamEvent,
  ChatAttachment,
  ChatMessage,
  ChatTurnUndoRef,
  CompactResult,
  ContextOverrides,
  ContextPreset,
  ContextUsageInfo,
  ProfileInfo,
  SeroSessionInfo,
  SeroSlashCommandInfo,
  SessionContext,
  SessionModelState,
  SessionUsageStats,
  WorkspaceConfig,
  WorkspaceCreateOptions,
  WorkspaceInfo,
  WorkspaceRoot,
} from '@/types/ipc';
import type { ProfileRemovalMode } from '@/types/profile';
import type { WorkspaceRuntimeBackend, WorkspaceRuntimeConfig } from '@/types/workspace-runtime';
import type {
  BrowserPackProgressIPC,
  BrowserPackStatusIPC,
  ToolchainProgressIPC,
  ToolchainStatusIPC,
  WorkspaceAccessRootsResult,
  WorkspaceRuntimeDiagnosticsIPC,
} from '@sero-ai/common';

ipcRenderer.on(IpcChannels.workspace.changed, () => {
  window.dispatchEvent(new Event('sero:workspace-changed'));
});

export const shellBridge = {
  showItemInFolder: (fullPath: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.shell.showItemInFolder, fullPath),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.shell.openExternal, url),
  clearRendererCache: (): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.shell.clearRendererCache),
};

export const profilesBridge = {
  list: (): Promise<ProfileInfo[]> => ipcRenderer.invoke(IpcChannels.profiles.list),
  getActive: (): Promise<ProfileInfo | null> =>
    ipcRenderer.invoke(IpcChannels.profiles.getActive),
  hasActive: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.profiles.hasActive),
  create: (
    name: string,
    profilePath?: string,
    copyAuthFromId?: string,
  ): Promise<ProfileInfo> =>
    ipcRenderer.invoke(IpcChannels.profiles.create, name, profilePath, copyAuthFromId),
  switch: (id: string): Promise<void> => ipcRenderer.invoke(IpcChannels.profiles.switch, id),
  rename: (id: string, newName: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.profiles.rename, id, newName),
  remove: (id: string, mode: ProfileRemovalMode): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.profiles.remove, id, mode),
  pickFolder: (): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannels.profiles.pickFolder),
  needsOnboarding: (): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.profiles.needsOnboarding),
  markOnboardingDone: (): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.profiles.markOnboardingDone),
  listAuthSources: (): Promise<ProfileInfo[]> =>
    ipcRenderer.invoke(IpcChannels.profiles.listAuthSources),
};

export const workspaceBridge = {
  list: (): Promise<WorkspaceInfo[]> => ipcRenderer.invoke(IpcChannels.workspace.list),
  create: (name: string, parentPath?: string, options?: WorkspaceCreateOptions): Promise<WorkspaceInfo> =>
    ipcRenderer.invoke(IpcChannels.workspace.create, name, parentPath, options),
  remove: (id: string): Promise<void> => ipcRenderer.invoke(IpcChannels.workspace.remove, id),
  getConfig: (id: string): Promise<WorkspaceConfig | null> =>
    ipcRenderer.invoke(IpcChannels.workspace.getConfig, id),
  addFolder: (folderPath: string, name?: string): Promise<WorkspaceInfo> =>
    ipcRenderer.invoke(IpcChannels.workspace.addFolder, folderPath, name),
  open: (id: string): Promise<void> => ipcRenderer.invoke(IpcChannels.workspace.open, id),
  close: (id: string): Promise<void> => ipcRenderer.invoke(IpcChannels.workspace.close, id),
  delete: (id: string): Promise<void> => ipcRenderer.invoke(IpcChannels.workspace.delete, id),
  pickFolder: (): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannels.workspace.pickFolder),
  infer: (message: string): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.workspace.infer, message),
  getRuntimeDiagnostics: (workspaceId?: string): Promise<WorkspaceRuntimeDiagnosticsIPC[]> =>
    ipcRenderer.invoke(IpcChannels.workspace.runtimeDiagnostics, workspaceId),
  getToolchainStatus: (): Promise<ToolchainStatusIPC> =>
    ipcRenderer.invoke(IpcChannels.workspace.getToolchainStatus),
  ensureCoreTools: (reason?: string): Promise<ToolchainStatusIPC> =>
    ipcRenderer.invoke(IpcChannels.workspace.ensureCoreTools, reason),
  onToolchainProgress: (callback: (event: ToolchainProgressIPC) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: ToolchainProgressIPC) => {
      callback(data);
    };
    ipcRenderer.on(IpcChannels.workspace.toolchainProgress, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.workspace.toolchainProgress, handler);
    };
  },
  getBrowserPackStatus: (): Promise<BrowserPackStatusIPC> =>
    ipcRenderer.invoke(IpcChannels.workspace.getBrowserPackStatus),
  ensureBrowserPack: (reason?: string): Promise<BrowserPackStatusIPC> =>
    ipcRenderer.invoke(IpcChannels.workspace.ensureBrowserPack, reason),
  uninstallBrowserPack: (): Promise<BrowserPackStatusIPC> =>
    ipcRenderer.invoke(IpcChannels.workspace.uninstallBrowserPack),
  onBrowserPackProgress: (callback: (event: BrowserPackProgressIPC) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: BrowserPackProgressIPC) => {
      callback(data);
    };
    ipcRenderer.on(IpcChannels.workspace.browserPackProgress, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.workspace.browserPackProgress, handler);
    };
  },
  getRuntimeConfig: (id: string): Promise<WorkspaceRuntimeConfig> =>
    ipcRenderer.invoke(IpcChannels.workspace.getRuntimeConfig, id),
  setRuntimeBackend: (id: string, backend: WorkspaceRuntimeBackend): Promise<WorkspaceInfo> =>
    ipcRenderer.invoke(IpcChannels.workspace.setRuntimeBackend, id, backend),
  /** @deprecated Use {@link setRuntimeBackend} for three-way runtime selection. */
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
  listRoots: (id: string): Promise<WorkspaceRoot[]> =>
    ipcRenderer.invoke(IpcChannels.workspace.listRoots, id),
  listAccessRoots: (id: string): Promise<WorkspaceAccessRootsResult> =>
    ipcRenderer.invoke(IpcChannels.workspace.listAccessRoots, id),
  addRoot: (
    id: string,
    input: { name: string; path: string; kind?: WorkspaceRoot['kind'] },
  ): Promise<WorkspaceRoot> => ipcRenderer.invoke(IpcChannels.workspace.addRoot, id, input),
  removeRoot: (id: string, rootId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.workspace.removeRoot, id, rootId),
  renameRoot: (id: string, rootId: string, newName: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.workspace.renameRoot, id, rootId, newName),
};

export const sessionsBridge = {
  list: (workspaceId?: string): Promise<SeroSessionInfo[]> =>
    ipcRenderer.invoke(IpcChannels.sessions.list, workspaceId),
  create: (workspaceId?: string): Promise<SeroSessionInfo> =>
    ipcRenderer.invoke(IpcChannels.sessions.create, workspaceId),
  delete: (sessionPath: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.sessions.delete, sessionPath),
  rename: (sessionId: string, name: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.sessions.rename, sessionId, name),
};

export const agentBridge = {
  open: (sessionId: string, sessionPath: string, workspaceId: string): Promise<ChatMessage[]> =>
    ipcRenderer.invoke(IpcChannels.agent.open, sessionId, sessionPath, workspaceId),
  prompt: (
    sessionId: string,
    text: string,
    attachments?: ChatAttachment[],
    clientMessageId?: string,
  ): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.agent.prompt, sessionId, text, attachments, clientMessageId),
  steer: (sessionId: string, text: string, clientMessageId?: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.agent.steer, sessionId, text, clientMessageId),
  abort: (sessionId: string): Promise<void> => ipcRenderer.invoke(IpcChannels.agent.abort, sessionId),
  close: (sessionId: string): Promise<void> => ipcRenderer.invoke(IpcChannels.agent.close, sessionId),
  notifySessionSwitch: (
    previousSessionId: string,
    reason?: 'new' | 'resume',
  ): Promise<void> =>
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
  undoToTurn: (sessionId: string, turnUndo: ChatTurnUndoRef): Promise<ChatMessage[]> =>
    ipcRenderer.invoke(IpcChannels.agent.undoToTurn, sessionId, turnUndo),
  onEvent: (callback: (event: AgentStreamEvent) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: AgentStreamEvent) => {
      callback(data);
    };
    ipcRenderer.on(IpcChannels.agent.event, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.agent.event, handler);
    };
  },
};

export const contextPresetsBridge = {
  load: (): Promise<ContextPreset[]> => ipcRenderer.invoke(IpcChannels.contextPresets.load),
  save: (presets: ContextPreset[]): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.contextPresets.save, presets),
};
