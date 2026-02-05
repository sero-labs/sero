import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface PersistedProject {
  id: string;
  name: string;
  image: string;
  cpus: number;
  memoryMB: number;
  ports: Array<{ host: number; container: number }>;
  createdAt: number;
}

interface PersistedState {
  version: 1;
  projects: PersistedProject[];
  activeProjectId?: string | null;
}

function getDataDir(): string {
  const dir = path.join(app.getPath('userData'), 'sero-data');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getProjectDir(projectId: string): string {
  const dir = path.join(getDataDir(), 'projects', projectId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getStatePath(): string {
  return path.join(getDataDir(), 'projects.json');
}

// ── Project list persistence ──────────────────────────────────

export function loadPersistedProjects(): PersistedProject[] {
  try {
    const raw = fs.readFileSync(getStatePath(), 'utf-8');
    const data: PersistedState = JSON.parse(raw);
    if (data.version === 1 && Array.isArray(data.projects)) {
      return data.projects;
    }
  } catch {
    // File doesn't exist or is corrupt — start fresh
  }
  return [];
}

export function saveProjects(projects: PersistedProject[]): void {
  const data: PersistedState = { version: 1, projects };
  try {
    fs.writeFileSync(getStatePath(), JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist projects:', err);
  }
}

export function removePersistedProject(id: string): void {
  const projects = loadPersistedProjects().filter((p) => p.id !== id);
  saveProjects(projects);
  // Clean up project-specific persistence data (layout, chat, editor state)
  try {
    const dir = path.join(getDataDir(), 'projects', id);
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* best effort */ }
  // Clean up host workspace files
  try {
    const wsDir = path.join(os.homedir(), '.sero', 'workspaces', id);
    fs.rmSync(wsDir, { recursive: true, force: true });
  } catch { /* best effort */ }
}

export function addPersistedProject(project: PersistedProject): void {
  const projects = loadPersistedProjects();
  const idx = projects.findIndex((p) => p.id === project.id);
  if (idx >= 0) {
    projects[idx] = project;
  } else {
    projects.push(project);
  }
  saveProjects(projects);
}

export function updatePersistedProject(id: string, updates: Partial<PersistedProject>): void {
  const projects = loadPersistedProjects();
  const idx = projects.findIndex((p) => p.id === id);
  if (idx >= 0) {
    projects[idx] = { ...projects[idx], ...updates };
    saveProjects(projects);
  }
}

// ── Active project persistence ────────────────────────────────

export function saveActiveProjectId(id: string | null): void {
  try {
    const raw = fs.readFileSync(getStatePath(), 'utf-8');
    const data = JSON.parse(raw);
    data.activeProjectId = id;
    fs.writeFileSync(getStatePath(), JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // If file doesn't exist yet, create minimal state
    const data: PersistedState = { version: 1, projects: [], activeProjectId: id };
    fs.writeFileSync(getStatePath(), JSON.stringify(data, null, 2), 'utf-8');
  }
}

export function loadActiveProjectId(): string | null {
  try {
    const raw = fs.readFileSync(getStatePath(), 'utf-8');
    const data = JSON.parse(raw);
    return data.activeProjectId ?? null;
  } catch {
    return null;
  }
}

// ── Editor state persistence (per project) ────────────────────

export function saveEditorState(projectId: string, state: { openFile: string | null }): void {
  try {
    const filePath = path.join(getProjectDir(projectId), 'editor.json');
    fs.writeFileSync(filePath, JSON.stringify(state), 'utf-8');
  } catch (err) {
    console.error(`Failed to save editor state for ${projectId}:`, err);
  }
}

export function loadEditorState(projectId: string): { openFile: string | null } | null {
  try {
    const filePath = path.join(getProjectDir(projectId), 'editor.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── Layout persistence (per project) ─────────────────────────

export function saveLayout(projectId: string, layout: any): void {
  try {
    const filePath = path.join(getProjectDir(projectId), 'layout.json');
    fs.writeFileSync(filePath, JSON.stringify(layout), 'utf-8');
  } catch (err) {
    console.error(`Failed to save layout for ${projectId}:`, err);
  }
}

export function loadLayout(projectId: string): any | null {
  try {
    const filePath = path.join(getProjectDir(projectId), 'layout.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── Chat history persistence (per project) ────────────────────

export function saveChatHistory(projectId: string, messages: any[]): void {
  try {
    const filePath = path.join(getProjectDir(projectId), 'chat.json');
    fs.writeFileSync(filePath, JSON.stringify(messages), 'utf-8');
  } catch (err) {
    console.error(`Failed to save chat for ${projectId}:`, err);
  }
}

export function loadChatHistory(projectId: string): any[] {
  try {
    const filePath = path.join(getProjectDir(projectId), 'chat.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
