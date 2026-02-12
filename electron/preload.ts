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
    open: (sessionPath: string): Promise<ChatMessage[]> =>
      ipcRenderer.invoke(IpcChannels.agent.open, sessionPath),

    prompt: (text: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.agent.prompt, text),

    abort: (): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.agent.abort),

    close: (): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.agent.close),

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
