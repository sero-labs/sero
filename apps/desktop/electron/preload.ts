import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '../src/types/ipc';
import type {
  WorkspaceInfo,
  WorkspaceConfig,
  SeroSessionInfo,
  ChatMessage,
  AgentStreamEvent,
  SeroSlashCommandInfo,
  SeroAppManifest,
  SessionUsageStats,
  SessionModelState,
} from '../src/types/ipc';

contextBridge.exposeInMainWorld('sero', {
  platform: process.platform,

  shell: {
    showItemInFolder: (fullPath: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.shell.showItemInFolder, fullPath),
  },

  workspace: {
    list: (): Promise<WorkspaceInfo[]> =>
      ipcRenderer.invoke(IpcChannels.workspace.list),

    create: (name: string): Promise<WorkspaceInfo> =>
      ipcRenderer.invoke(IpcChannels.workspace.create, name),

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
  },

  sessions: {
    list: (workspaceId?: string): Promise<SeroSessionInfo[]> =>
      ipcRenderer.invoke(IpcChannels.sessions.list, workspaceId),

    create: (workspaceId?: string): Promise<SeroSessionInfo> =>
      ipcRenderer.invoke(IpcChannels.sessions.create, workspaceId),

    delete: (sessionPath: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.sessions.delete, sessionPath),
  },

  agent: {
    open: (sessionId: string, sessionPath: string, workspaceId: string): Promise<ChatMessage[]> =>
      ipcRenderer.invoke(IpcChannels.agent.open, sessionId, sessionPath, workspaceId),

    prompt: (sessionId: string, text: string, attachments?: import('../src/types/ipc').ChatAttachment[]): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.agent.prompt, sessionId, text, attachments),

    abort: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.agent.abort, sessionId),

    close: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.agent.close, sessionId),

    getCommands: (sessionId: string): Promise<SeroSlashCommandInfo[]> =>
      ipcRenderer.invoke(IpcChannels.agent.getCommands, sessionId),

    reloadResources: (sessionId: string): Promise<SeroSlashCommandInfo[]> =>
      ipcRenderer.invoke(IpcChannels.agent.reloadResources, sessionId),

    getUsage: (sessionId: string): Promise<SessionUsageStats | null> =>
      ipcRenderer.invoke(IpcChannels.agent.getUsage, sessionId),

    getModelState: (sessionId: string): Promise<SessionModelState | null> =>
      ipcRenderer.invoke(IpcChannels.agent.getModelState, sessionId),

    setModel: (sessionId: string, provider: string, modelId: string): Promise<SessionModelState> =>
      ipcRenderer.invoke(IpcChannels.agent.setModel, sessionId, provider, modelId),

    setThinkingLevel: (sessionId: string, level: string): Promise<SessionModelState> =>
      ipcRenderer.invoke(IpcChannels.agent.setThinkingLevel, sessionId, level),

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

  appState: {
    read: (filePath: string): Promise<unknown> =>
      ipcRenderer.invoke(IpcChannels.appState.read, filePath),

    write: (filePath: string, data: unknown): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.appState.write, filePath, data),

    watch: (filePath: string): Promise<unknown> =>
      ipcRenderer.invoke(IpcChannels.appState.watch, filePath),

    unwatch: (filePath: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.appState.unwatch, filePath),

    onChange: (callback: (filePath: string, data: unknown) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, fp: string, data: unknown) => {
        callback(fp, data);
      };
      ipcRenderer.on(IpcChannels.appState.change, handler);
      return () => {
        ipcRenderer.removeListener(IpcChannels.appState.change, handler);
      };
    },
  },

  apps: {
    discover: (): Promise<SeroAppManifest[]> =>
      ipcRenderer.invoke(IpcChannels.apps.discover),
  },

  appAgent: {
    prompt: (appId: string, workspaceId: string, text: string): Promise<string> =>
      ipcRenderer.invoke(IpcChannels.appAgent.prompt, appId, workspaceId, text),
  },
});
