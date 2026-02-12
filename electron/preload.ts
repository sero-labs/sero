import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '../src/types/ipc';
import type {
  WorkspaceInfo,
  WorkspaceConfig,
  SeroSessionInfo,
  ChatMessage,
  AgentStreamEvent,
} from '../src/types/ipc';

contextBridge.exposeInMainWorld('sero', {
  platform: process.platform,

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

    setAutoOpen: (id: string, autoOpen: boolean): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.workspace.setAutoOpen, id, autoOpen),

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

    prompt: (sessionId: string, text: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.agent.prompt, sessionId, text),

    abort: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.agent.abort, sessionId),

    close: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.agent.close, sessionId),

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
});
