import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
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
  AuthProvidersResponse,
  OAuthEvent,
  ContainerInfo,
  DevServer,
  DevServerEvent,
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

    setContainer: (id: string, enabled: boolean): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.workspace.setContainer, id, enabled),
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
    onNewAppDetected: (callback: (appName: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, name: string) => {
        callback(name);
      };
      ipcRenderer.on(IpcChannels.apps.newAppDetected, handler);
      return () => {
        ipcRenderer.removeListener(IpcChannels.apps.newAppDetected, handler);
      };
    },
  },

  appAgent: {
    prompt: (appId: string, workspaceId: string, text: string): Promise<string> =>
      ipcRenderer.invoke(IpcChannels.appAgent.prompt, appId, workspaceId, text),
  },

  auth: {
    getProviders: (): Promise<AuthProvidersResponse> =>
      ipcRenderer.invoke(IpcChannels.auth.getProviders),

    login: (providerId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.auth.login, providerId),

    logout: (providerId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.auth.logout, providerId),

    setApiKey: (providerId: string, key: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.auth.setApiKey, providerId, key),

    removeApiKey: (providerId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.auth.removeApiKey, providerId),

    respondPrompt: (value: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.auth.respondPrompt, value),

    respondManualCode: (value: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.auth.respondManualCode, value),

    cancel: (): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.auth.cancel),

    onEvent: (callback: (event: OAuthEvent) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: OAuthEvent) => {
        callback(data);
      };
      ipcRenderer.on(IpcChannels.auth.event, handler);
      return () => {
        ipcRenderer.removeListener(IpcChannels.auth.event, handler);
      };
    },
  },

  container: {
    status: (workspaceId: string): Promise<ContainerInfo | null> =>
      ipcRenderer.invoke(IpcChannels.container.status, workspaceId),

    inspect: (workspaceId: string): Promise<ContainerInfo> =>
      ipcRenderer.invoke(IpcChannels.container.inspect, workspaceId),

    ensure: (workspaceId: string): Promise<ContainerInfo | null> =>
      ipcRenderer.invoke(IpcChannels.container.ensure, workspaceId),
  },

  devServer: {
    list: (workspaceId?: string): Promise<DevServer[]> =>
      ipcRenderer.invoke(IpcChannels.devServer.list, workspaceId),

    stop: (serverId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.devServer.stop, serverId),

    restart: (serverId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.devServer.restart, serverId),

    unregister: (serverId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.devServer.unregister, serverId),

    openInBrowser: (serverId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.devServer.openInBrowser, serverId),

    onEvent: (callback: (event: DevServerEvent) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: DevServerEvent) => {
        callback(data);
      };
      ipcRenderer.on(IpcChannels.devServer.event, handler);
      return () => {
        ipcRenderer.removeListener(IpcChannels.devServer.event, handler);
      };
    },
  },

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

  layout: {
    save: (state: { mainSidebarOpen: boolean; chatPanelOpen: boolean }): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.layout.save, state),
    load: (): Promise<{ mainSidebarOpen: boolean; chatPanelOpen: boolean } | null> =>
      ipcRenderer.invoke(IpcChannels.layout.load),
  },

  editor: {
    readFile: (workspaceId: string, filePath: string): Promise<string> =>
      ipcRenderer.invoke(IpcChannels.editor.readFile, workspaceId, filePath),
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
    rename: (workspaceId: string, oldPath: string, newPath: string): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannels.editor.rename, workspaceId, oldPath, newPath),
    delete: (workspaceId: string, itemPath: string): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannels.editor.delete, workspaceId, itemPath),
    createFile: (workspaceId: string, filePath: string): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannels.editor.createFile, workspaceId, filePath),
    createDir: (workspaceId: string, dirPath: string): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannels.editor.createDir, workspaceId, dirPath),
  },

  filetree: {
    watch: (workspaceId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.filetree.watch, workspaceId),
    unwatch: (workspaceId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.filetree.unwatch, workspaceId),
    onChanged: (callback: (data: { workspaceId: string; directories: string[] }) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, data: { workspaceId: string; directories: string[] }) => callback(data);
      ipcRenderer.on(IpcChannels.filetree.changed, handler);
      return () => { ipcRenderer.removeListener(IpcChannels.filetree.changed, handler); };
    },
  },

  lsp: {
    start: (workspaceId: string, languageId: string) =>
      ipcRenderer.invoke(IpcChannels.lsp.start, workspaceId, languageId),
    stop: (workspaceId: string, language: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.lsp.stop, workspaceId, language),
    request: (workspaceId: string, language: string, method: string, params?: unknown) =>
      ipcRenderer.invoke(IpcChannels.lsp.request, workspaceId, language, method, params),
    notify: (workspaceId: string, language: string, method: string, params?: unknown): void =>
      ipcRenderer.send(IpcChannels.lsp.notify, workspaceId, language, method, params),
    hasServer: (workspaceId: string, language: string): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannels.lsp.hasServer, workspaceId, language),
    onNotification: (callback: (data: { workspaceId: string; language: string; notification: any }) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, data: any) => callback(data);
      ipcRenderer.on(IpcChannels.lsp.notification, handler);
      return () => { ipcRenderer.removeListener(IpcChannels.lsp.notification, handler); };
    },
    onServerStopped: (callback: (data: { workspaceId: string; language: string }) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, data: any) => callback(data);
      ipcRenderer.on(IpcChannels.lsp.serverStopped, handler);
      return () => { ipcRenderer.removeListener(IpcChannels.lsp.serverStopped, handler); };
    },
  },

});
