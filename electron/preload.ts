import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '../src/types/ipc';
import type { SeroSessionInfo, ChatMessage, AgentStreamEvent } from '../src/types/ipc';

contextBridge.exposeInMainWorld('sero', {
  platform: process.platform,

  sessions: {
    list: (): Promise<SeroSessionInfo[]> =>
      ipcRenderer.invoke(IpcChannels.sessions.list),

    create: (): Promise<SeroSessionInfo> =>
      ipcRenderer.invoke(IpcChannels.sessions.create),

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
