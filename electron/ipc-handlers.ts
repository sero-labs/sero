import { IpcMain, BrowserWindow } from 'electron';
import { ContainerManager } from './container-manager';
import { AgentManager } from './agent-manager';
import { SkillManager } from './skill-manager';
import { LspManager } from './lsp/lsp-manager';
import {
  loadPersistedProjects, addPersistedProject, removePersistedProject,
  updatePersistedProject,
  saveLayout, loadLayout, saveChatHistory, loadChatHistory,
  saveActiveProjectId, loadActiveProjectId,
  saveEditorState, loadEditorState,
  loadEnvVars, saveEnvVars, setEnvVar, removeEnvVar,
  type PersistedProject,
} from './persistence';

export function registerIpcHandlers(
  ipcMain: IpcMain,
  containerManager: ContainerManager,
  agentManager: AgentManager,
  skillManager: SkillManager,
  lspManager: LspManager,
) {
  // ── Container IPC ──────────────────────────────────────────────

  ipcMain.handle('container:create', async (_event, config) => {
    return containerManager.create(config);
  });

  ipcMain.handle('container:stop', async (_event, projectId: string) => {
    await containerManager.stop(projectId);
  });

  ipcMain.handle('container:remove', async (_event, projectId: string) => {
    await containerManager.remove(projectId);
  });

  ipcMain.handle('container:exec', async (_event, projectId: string, command: string, cwd?: string) => {
    return containerManager.exec(projectId, command, cwd);
  });

  ipcMain.handle('container:inspect', async (_event, projectId: string) => {
    return containerManager.inspect(projectId);
  });

  ipcMain.handle('container:list', async () => {
    return containerManager.list();
  });

  ipcMain.handle('container:writeFile', async (_event, projectId: string, filePath: string, content: string) => {
    await containerManager.writeFile(projectId, filePath, content);
  });

  ipcMain.handle('container:readFile', async (_event, projectId: string, filePath: string) => {
    return containerManager.readFile(projectId, filePath);
  });

  ipcMain.handle('container:listFiles', async (_event, projectId: string, dirPath: string) => {
    return containerManager.listFiles(projectId, dirPath);
  });

  // ── Agent IPC ──────────────────────────────────────────────────

  ipcMain.handle('agent:create', async (_event, projectId: string) => {
    // Clear any existing subscriptions to avoid stacking on re-create
    agentManager.unsubscribeAll(projectId);
    await agentManager.createSession(projectId);

    // Subscribe to events and forward to renderer
    agentManager.subscribe(projectId, (agentEvent) => {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        try {
          win.webContents.send('agent:event', {
            projectId,
            type: agentEvent.type,
            data: agentEvent,
          });
        } catch { /* window may be disposed */ }
      }
    });
  });

  ipcMain.handle('agent:prompt', async (_event, projectId: string, message: string) => {
    try {
      await agentManager.prompt(projectId, message);
    } catch (err: any) {
      // Always notify renderer that the agent turn is done, even on error
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        try {
          if (!win.isDestroyed()) {
            win.webContents.send('agent:event', {
              projectId,
              type: 'agent_error',
              data: { message: err?.message ?? String(err) },
            });
          }
        } catch { /* window may be closing */ }
      }
    }
  });

  ipcMain.handle('agent:abort', async (_event, projectId: string) => {
    try {
      await agentManager.abort(projectId);
    } catch (err: any) {
      console.error(`agent:abort error for ${projectId}:`, err);
    }
    // Always notify renderer that agent is idle after abort
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      try {
        if (!win.isDestroyed()) {
          win.webContents.send('agent:event', {
            projectId,
            type: 'agent_end',
            data: {},
          });
        }
      } catch { /* window may be closing */ }
    }
  });

  ipcMain.handle('agent:dispose', async (_event, projectId: string) => {
    agentManager.dispose(projectId);
  });

  // ── Terminal IPC ───────────────────────────────────────────────

  ipcMain.handle('terminal:create', async (_event, projectId: string, terminalId: string) => {
    const pty = containerManager.createTerminal(projectId, terminalId);

    // node-pty gives us a single unified data stream (stdout+stderr via PTY)
    pty.onData((data: string) => {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        try {
          if (!win.isDestroyed()) {
            win.webContents.send('terminal:data', terminalId, data);
          }
        } catch { /* window may be closing — safe to ignore */ }
      }
    });
  });

  ipcMain.handle('terminal:write', async (_event, terminalId: string, data: string) => {
    const proc = containerManager.getTerminal(terminalId);
    if (proc) {
      try {
        proc.write(data);
      } catch (err: any) {
        // EPIPE: PTY process already exited — safe to ignore
        if (err?.code !== 'EPIPE') {
          console.warn(`[sero] terminal:write error for ${terminalId}:`, err?.message);
        }
      }
    }
  });

  ipcMain.handle('terminal:resize', async (_event, terminalId: string, cols: number, rows: number) => {
    const proc = containerManager.getTerminal(terminalId);
    if (proc) {
      try {
        proc.resize(cols, rows);
      } catch { /* PTY may have exited — safe to ignore */ }
    }
  });

  ipcMain.handle('terminal:dispose', async (_event, terminalId: string) => {
    containerManager.disposeTerminal(terminalId);
  });

  // ── Persistence IPC ────────────────────────────────────────────

  ipcMain.handle('persistence:loadProjects', async () => {
    return loadPersistedProjects();
  });

  ipcMain.handle('persistence:saveProject', async (_event, project: PersistedProject) => {
    addPersistedProject(project);
  });

  ipcMain.handle('persistence:removeProject', async (_event, id: string) => {
    removePersistedProject(id);
  });

  ipcMain.handle('persistence:updateProject', async (_event, id: string, updates: any) => {
    updatePersistedProject(id, updates);
  });

  // Layout
  ipcMain.handle('persistence:saveLayout', async (_event, projectId: string, layout: any) => {
    saveLayout(projectId, layout);
  });

  ipcMain.handle('persistence:loadLayout', async (_event, projectId: string) => {
    return loadLayout(projectId);
  });

  // Chat history
  ipcMain.handle('persistence:saveChatHistory', async (_event, projectId: string, messages: any[]) => {
    saveChatHistory(projectId, messages);
  });

  ipcMain.handle('persistence:loadChatHistory', async (_event, projectId: string) => {
    return loadChatHistory(projectId);
  });

  // Active project
  ipcMain.handle('persistence:saveActiveProjectId', async (_event, id: string | null) => {
    saveActiveProjectId(id);
  });

  ipcMain.handle('persistence:loadActiveProjectId', async () => {
    return loadActiveProjectId();
  });

  // Editor state
  ipcMain.handle('persistence:saveEditorState', async (_event, projectId: string, state: any) => {
    saveEditorState(projectId, state);
  });

  ipcMain.handle('persistence:loadEditorState', async (_event, projectId: string) => {
    return loadEditorState(projectId);
  });

  // ── Environment Variables IPC ────────────────────────────────

  ipcMain.handle('env:list', async () => {
    return loadEnvVars();
  });

  ipcMain.handle('env:set', async (_event, key: string, value: string) => {
    setEnvVar(key, value);
    containerManager.invalidateEnvCache();
  });

  ipcMain.handle('env:remove', async (_event, key: string) => {
    removeEnvVar(key);
    containerManager.invalidateEnvCache();
  });

  ipcMain.handle('env:setAll', async (_event, env: Record<string, string>) => {
    saveEnvVars(env);
    containerManager.invalidateEnvCache();
  });

  // ── Skills IPC ─────────────────────────────────────────────

  ipcMain.handle('skills:list', async (_event, projectId?: string) => {
    return skillManager.listAll(projectId);
  });

  ipcMain.handle('skills:get', async (_event, name: string) => {
    return skillManager.getSkill(name) ?? null;
  });

  ipcMain.handle('skills:readContent', async (_event, name: string) => {
    return skillManager.readSkillContent(name);
  });

  ipcMain.handle('skills:listFiles', async (_event, name: string) => {
    return skillManager.listSkillFiles(name);
  });

  ipcMain.handle('skills:enable', async (_event, projectId: string, skillName: string) => {
    skillManager.enableSkill(projectId, skillName);
  });

  ipcMain.handle('skills:disable', async (_event, projectId: string, skillName: string) => {
    skillManager.disableSkill(projectId, skillName);
  });

  ipcMain.handle('skills:toggle', async (_event, projectId: string, skillName: string) => {
    return skillManager.toggleSkill(projectId, skillName);
  });

  ipcMain.handle('skills:install', async (_event, source: string, scope?: 'global' | 'project') => {
    return skillManager.installSkill(source, scope);
  });

  ipcMain.handle('skills:previewInstall', async (_event, source: string) => {
    return skillManager.previewInstall(source);
  });

  ipcMain.handle('skills:installSelected', async (_event, previewId: string, selectedNames: string[], scope?: 'global' | 'project') => {
    return skillManager.installSelected(previewId, selectedNames, scope);
  });

  ipcMain.handle('skills:cleanupPreview', async (_event, previewId: string) => {
    skillManager.cleanupPreview(previewId);
  });

  ipcMain.handle('skills:uninstall', async (_event, name: string) => {
    return skillManager.uninstallSkill(name);
  });

  ipcMain.handle('skills:create', async (_event, name: string, description: string, scope?: 'global' | 'project') => {
    return skillManager.createSkill(name, description, scope);
  });

  ipcMain.handle('skills:discover', async () => {
    await skillManager.discoverAll();
    return skillManager.listAll();
  });

  // ── LSP IPC ────────────────────────────────────────────────

  ipcMain.handle('lsp:start', async (_event, projectId: string, languageId: string) => {
    return lspManager.startServer(projectId, languageId);
  });

  ipcMain.handle('lsp:stop', async (_event, projectId: string, language: string) => {
    await lspManager.stopServer(projectId, language);
  });

  ipcMain.handle('lsp:request', async (_event, projectId: string, language: string, method: string, params?: unknown) => {
    return lspManager.sendRequest(projectId, language, method, params);
  });

  ipcMain.handle('lsp:notify', async (_event, projectId: string, language: string, method: string, params?: unknown) => {
    lspManager.sendNotification(projectId, language, method, params);
  });

  ipcMain.handle('lsp:hasServer', async (_event, projectId: string, language: string) => {
    return lspManager.hasServer(projectId, language);
  });

  // Forward LSP notifications (diagnostics etc.) to the renderer
  lspManager.on('notification', (data: { projectId: string; language: string; notification: any }) => {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      try {
        if (!win.isDestroyed()) {
          win.webContents.send('lsp:notification', data);
        }
      } catch { /* window may be closing */ }
    }
  });

  lspManager.on('serverStopped', (data: { projectId: string; language: string }) => {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      try {
        if (!win.isDestroyed()) {
          win.webContents.send('lsp:serverStopped', data);
        }
      } catch { /* window may be closing */ }
    }
  });
}
