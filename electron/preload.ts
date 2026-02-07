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

export type SkillInfo = {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: string;
  scope: 'global' | 'project' | 'custom';
  enabled: boolean;
  disableModelInvocation: boolean;
};

export type PreviewSkillInfo = {
  name: string;
  description: string;
  relativePath: string;
};

export type SkillPreviewResult = {
  previewId: string;
  repoName: string;
  skills: PreviewSkillInfo[];
};

export type SelectiveInstallResult = {
  installed: string[];
  errors: Array<{ name: string; error: string }>;
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

  // Environment variables
  env: {
    list: () =>
      ipcRenderer.invoke('env:list') as Promise<Record<string, string>>,
    set: (key: string, value: string) =>
      ipcRenderer.invoke('env:set', key, value),
    remove: (key: string) =>
      ipcRenderer.invoke('env:remove', key),
    setAll: (env: Record<string, string>) =>
      ipcRenderer.invoke('env:setAll', env),
  },

  // Skills operations
  skills: {
    list: (projectId?: string) =>
      ipcRenderer.invoke('skills:list', projectId) as Promise<SkillInfo[]>,
    get: (name: string) =>
      ipcRenderer.invoke('skills:get', name) as Promise<SkillInfo | null>,
    readContent: (name: string) =>
      ipcRenderer.invoke('skills:readContent', name) as Promise<string | null>,
    listFiles: (name: string) =>
      ipcRenderer.invoke('skills:listFiles', name) as Promise<string[]>,
    enable: (projectId: string, skillName: string) =>
      ipcRenderer.invoke('skills:enable', projectId, skillName),
    disable: (projectId: string, skillName: string) =>
      ipcRenderer.invoke('skills:disable', projectId, skillName),
    toggle: (projectId: string, skillName: string) =>
      ipcRenderer.invoke('skills:toggle', projectId, skillName) as Promise<boolean>,
    install: (source: string, scope?: 'global' | 'project') =>
      ipcRenderer.invoke('skills:install', source, scope) as Promise<{ success: boolean; name?: string; error?: string }>,
    previewInstall: (source: string) =>
      ipcRenderer.invoke('skills:previewInstall', source) as Promise<SkillPreviewResult>,
    installSelected: (previewId: string, selectedNames: string[], scope?: 'global' | 'project') =>
      ipcRenderer.invoke('skills:installSelected', previewId, selectedNames, scope) as Promise<SelectiveInstallResult>,
    cleanupPreview: (previewId: string) =>
      ipcRenderer.invoke('skills:cleanupPreview', previewId) as Promise<void>,
    uninstall: (name: string) =>
      ipcRenderer.invoke('skills:uninstall', name) as Promise<{ success: boolean; error?: string }>,
    create: (name: string, description: string, scope?: 'global' | 'project') =>
      ipcRenderer.invoke('skills:create', name, description, scope) as Promise<{ success: boolean; path?: string; error?: string }>,
    discover: () =>
      ipcRenderer.invoke('skills:discover') as Promise<SkillInfo[]>,
  },

  // LSP operations
  lsp: {
    start: (projectId: string, languageId: string) =>
      ipcRenderer.invoke('lsp:start', projectId, languageId) as Promise<{ capabilities: Record<string, unknown>; language: string }>,
    stop: (projectId: string, language: string) =>
      ipcRenderer.invoke('lsp:stop', projectId, language),
    request: (projectId: string, language: string, method: string, params?: unknown) =>
      ipcRenderer.invoke('lsp:request', projectId, language, method, params) as Promise<unknown>,
    notify: (projectId: string, language: string, method: string, params?: unknown) =>
      ipcRenderer.invoke('lsp:notify', projectId, language, method, params),
    hasServer: (projectId: string, language: string) =>
      ipcRenderer.invoke('lsp:hasServer', projectId, language) as Promise<boolean>,
    onNotification: (callback: (data: { projectId: string; language: string; notification: any }) => void) => {
      const handler = (_: unknown, data: { projectId: string; language: string; notification: any }) => callback(data);
      ipcRenderer.on('lsp:notification', handler);
      return () => { ipcRenderer.removeListener('lsp:notification', handler); };
    },
    onServerStopped: (callback: (data: { projectId: string; language: string }) => void) => {
      const handler = (_: unknown, data: { projectId: string; language: string }) => callback(data);
      ipcRenderer.on('lsp:serverStopped', handler);
      return () => { ipcRenderer.removeListener('lsp:serverStopped', handler); };
    },
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
