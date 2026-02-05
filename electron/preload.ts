import { contextBridge, ipcRenderer } from 'electron';

export type ContainerInfo = {
  id: string;
  image: string;
  state: string;
  addr: string;
  cpus: number;
  memory: string;
};

export type ProjectConfig = {
  id: string;
  name: string;
  image?: string;
  cpus?: number;
  memoryMB?: number;
  ports?: Array<{ host: number; container: number }>;
};

export type AgentEvent = {
  projectId: string;
  type: string;
  data: unknown;
};

const seroAPI = {
  // Container operations
  container: {
    create: (config: ProjectConfig) =>
      ipcRenderer.invoke('container:create', config),
    stop: (projectId: string) =>
      ipcRenderer.invoke('container:stop', projectId),
    remove: (projectId: string) =>
      ipcRenderer.invoke('container:remove', projectId),
    exec: (projectId: string, command: string, cwd?: string) =>
      ipcRenderer.invoke('container:exec', projectId, command, cwd),
    inspect: (projectId: string) =>
      ipcRenderer.invoke('container:inspect', projectId),
    list: () =>
      ipcRenderer.invoke('container:list'),
    writeFile: (projectId: string, filePath: string, content: string) =>
      ipcRenderer.invoke('container:writeFile', projectId, filePath, content),
    readFile: (projectId: string, filePath: string) =>
      ipcRenderer.invoke('container:readFile', projectId, filePath),
    listFiles: (projectId: string, dirPath: string) =>
      ipcRenderer.invoke('container:listFiles', projectId, dirPath),
  },

  // Agent operations
  agent: {
    create: (projectId: string) =>
      ipcRenderer.invoke('agent:create', projectId),
    prompt: (projectId: string, message: string) =>
      ipcRenderer.invoke('agent:prompt', projectId, message),
    abort: (projectId: string) =>
      ipcRenderer.invoke('agent:abort', projectId),
    dispose: (projectId: string) =>
      ipcRenderer.invoke('agent:dispose', projectId),
    onEvent: (callback: (event: AgentEvent) => void) => {
      const handler = (_: unknown, event: AgentEvent) => callback(event);
      ipcRenderer.on('agent:event', handler);
      return () => { ipcRenderer.removeListener('agent:event', handler); };
    },
  },

  // Persistence operations
  persistence: {
    loadProjects: () =>
      ipcRenderer.invoke('persistence:loadProjects'),
    saveProject: (project: any) =>
      ipcRenderer.invoke('persistence:saveProject', project),
    removeProject: (id: string) =>
      ipcRenderer.invoke('persistence:removeProject', id),
    updateProject: (id: string, updates: any) =>
      ipcRenderer.invoke('persistence:updateProject', id, updates),
    saveLayout: (projectId: string, layout: any) =>
      ipcRenderer.invoke('persistence:saveLayout', projectId, layout),
    loadLayout: (projectId: string) =>
      ipcRenderer.invoke('persistence:loadLayout', projectId),
    saveChatHistory: (projectId: string, messages: any[]) =>
      ipcRenderer.invoke('persistence:saveChatHistory', projectId, messages),
    loadChatHistory: (projectId: string) =>
      ipcRenderer.invoke('persistence:loadChatHistory', projectId),
    saveActiveProjectId: (id: string | null) =>
      ipcRenderer.invoke('persistence:saveActiveProjectId', id),
    loadActiveProjectId: () =>
      ipcRenderer.invoke('persistence:loadActiveProjectId'),
    saveEditorState: (projectId: string, state: any) =>
      ipcRenderer.invoke('persistence:saveEditorState', projectId, state),
    loadEditorState: (projectId: string) =>
      ipcRenderer.invoke('persistence:loadEditorState', projectId),
  },

  // Terminal operations
  terminal: {
    create: (projectId: string, terminalId: string) =>
      ipcRenderer.invoke('terminal:create', projectId, terminalId),
    write: (terminalId: string, data: string) =>
      ipcRenderer.invoke('terminal:write', terminalId, data),
    resize: (terminalId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:resize', terminalId, cols, rows),
    dispose: (terminalId: string) =>
      ipcRenderer.invoke('terminal:dispose', terminalId),
    onData: (callback: (terminalId: string, data: string) => void) => {
      const handler = (_: unknown, terminalId: string, data: string) =>
        callback(terminalId, data);
      ipcRenderer.on('terminal:data', handler);
      return () => { ipcRenderer.removeListener('terminal:data', handler); };
    },
  },
};

contextBridge.exposeInMainWorld('sero', seroAPI);

export type SeroAPI = typeof seroAPI;
