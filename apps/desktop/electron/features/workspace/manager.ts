/**
 * WorkspaceManager — manages the workspace registry and configs.
 *
 * Registry: ~/.sero-ui/agent/workspaces.json
 * Per-workspace config: .sero-workspace.json at workspace root.
 */

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import type {
  WorkspaceRegistryEntry,
  WorkspaceConfig,
  WorkspaceInfo,
} from '../../../src/types/ipc';

import { SERO_HOME, SERO_AGENT_DIR } from '../../platform/env';
import { inferWorkspaceFromMessage } from './inference';
import { slugify, ensureUniqueId, prettifyName } from './utils';
import * as mounts from './mounts';
import * as roots from './roots';

const EDITOR_STATE_DIR = path.join(SERO_AGENT_DIR, 'editor-state');

// ── Paths ────────────────────────────────────────────────────

const REGISTRY_PATH = path.join(SERO_AGENT_DIR, 'workspaces.json');
const WORKSPACES_DIR = path.join(SERO_HOME, 'workspaces');

// ── Registry shape on disk ───────────────────────────────────

interface WorkspaceRegistry {
  workspaces: WorkspaceRegistryEntry[];
}

// ── Default workspace configs ────────────────────────────────

const DEFAULT_GLOBAL_CONFIG: WorkspaceConfig = {
  id: 'global',
  name: 'Global',
  description: 'Cross-cutting personal data — knowledge, finance, contacts, templates',
  container: false,
  contextHints: ['Personal knowledge base and reference data'],
  tags: ['default', 'personal', 'knowledge'],
};

// ── WorkspaceManager ─────────────────────────────────────────

export class WorkspaceManager {
  private registry: WorkspaceRegistry = { workspaces: [] };
  private configCache: Map<string, WorkspaceConfig> = new Map();

  // ── Lifecycle ──────────────────────────────────────────────

  /** Load registry from disk. Creates defaults if first run. */
  async init(): Promise<void> {
    await this.ensureDirs();
    await this.loadRegistry();
    await this.ensureDefaults();
    await this.migrateDefaultContainerOff();
  }

  /** Ensure required directories exist. */
  private async ensureDirs(): Promise<void> {
    await fs.mkdir(SERO_AGENT_DIR, { recursive: true });
    await fs.mkdir(WORKSPACES_DIR, { recursive: true });
  }

  // ── Registry I/O ──────────────────────────────────────────

  /** Load registry from ~/.sero-ui/agent/workspaces.json. */
  private async loadRegistry(): Promise<void> {
    try {
      const raw = await fs.readFile(REGISTRY_PATH, 'utf8');
      const parsed = JSON.parse(raw) as WorkspaceRegistry;
      const workspaces = Array.isArray(parsed.workspaces) ? parsed.workspaces : [];

      // Migrate: autoOpen → open
      let migrated = false;
      for (const entry of workspaces) {
        if ('open' in entry) continue;
        const legacy = entry as unknown as Record<string, unknown>;
        (entry as WorkspaceRegistryEntry).open = legacy.autoOpen !== false;
        delete legacy.autoOpen;
        migrated = true;
      }

      this.registry = { workspaces };
      if (migrated) await this.saveRegistry();
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.registry = { workspaces: [] };
      } else {
        console.error('[workspace] Failed to load registry:', err);
        this.registry = { workspaces: [] };
      }
    }
  }

  /** Save registry to disk. */
  private async saveRegistry(): Promise<void> {
    const json = JSON.stringify(this.registry, null, 2) + '\n';
    await fs.writeFile(REGISTRY_PATH, json, 'utf8');
  }

  // ── Default workspaces ────────────────────────────────────

  /** Create global workspace if it doesn't exist. */
  private async ensureDefaults(): Promise<void> {
    let changed = false;

    // Global
    if (!this.findEntry('global')) {
      const globalPath = path.join(WORKSPACES_DIR, 'global');
      await fs.mkdir(globalPath, { recursive: true });
      await this.writeConfig(globalPath, DEFAULT_GLOBAL_CONFIG);
      this.registry.workspaces.push({
        id: 'global',
        path: globalPath,
        open: true,
      });
      changed = true;
    }

    if (changed) {
      await this.saveRegistry();
    }
  }

  /**
   * Migrate existing global workspace to container: false.
   * Only writes the config if it exists and `container` is undefined (not yet set).
   */
  private async migrateDefaultContainerOff(): Promise<void> {
    for (const id of ['global'] as const) {
      const entry = this.findEntry(id);
      if (!entry) continue;
      const config = await this.readConfig(entry.path);
      if (config && config.container === undefined) {
        config.container = false;
        await this.writeConfig(entry.path, config);
        this.configCache.delete(id);
      }
    }
  }

  // ── Config I/O ────────────────────────────────────────────

  /** Read .sero-workspace.json from a workspace directory. */
  async readConfig(workspacePath: string): Promise<WorkspaceConfig | null> {
    const configPath = path.join(workspacePath, '.sero-workspace.json');
    try {
      const raw = await fs.readFile(configPath, 'utf8');
      return JSON.parse(raw) as WorkspaceConfig;
    } catch {
      return null;
    }
  }

  /** Write .sero-workspace.json to a workspace directory. */
  private async writeConfig(workspacePath: string, config: WorkspaceConfig): Promise<void> {
    const configPath = path.join(workspacePath, '.sero-workspace.json');
    const json = JSON.stringify(config, null, 2) + '\n';
    await fs.writeFile(configPath, json, 'utf8');
  }

  // ── Public API ────────────────────────────────────────────

  /** List all registered workspaces with merged config data. */
  async list(): Promise<WorkspaceInfo[]> {
    const result: WorkspaceInfo[] = [];

    for (const entry of this.registry.workspaces) {
      const info = await this.getInfo(entry);
      if (info) result.push(info);
    }

    return result;
  }

  /** Get full config for a workspace by ID. */
  async getConfig(id: string): Promise<WorkspaceConfig | null> {
    const entry = this.findEntry(id);
    if (!entry) return null;

    // Check cache
    const cached = this.configCache.get(id);
    if (cached) return cached;

    const config = await this.readConfig(entry.path);
    if (config) {
      this.configCache.set(id, config);
    }
    return config;
  }

  /**
   * Register an existing folder as a workspace.
   * Creates .sero-workspace.json if it doesn't exist.
   */
  async addFolder(folderPath: string, name?: string): Promise<WorkspaceInfo> {
    const absPath = path.resolve(folderPath);

    // Check folder exists
    const stat = await fs.stat(absPath);
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${absPath}`);
    }

    // Derive ID from folder name
    const id = slugify(path.basename(absPath));
    const uniqueId = this.ensureUniqueId(id);

    // Check if already registered (by path) — reopen if closed
    const existing = this.registry.workspaces.find(
      (w) => path.resolve(w.path) === absPath,
    );
    if (existing) {
      // Already registered — just ensure it's expanded
      if (!existing.open) {
        existing.open = true;
        await this.saveRegistry();
      }
      const info = await this.getInfo(existing);
      if (info) return info;
      throw new Error(`Workspace at ${absPath} is registered but unreadable`);
    }

    // Read or create config
    let config = await this.readConfig(absPath);
    if (!config) {
      config = {
        id: uniqueId,
        name: name || prettifyName(path.basename(absPath)),
      };
      await this.writeConfig(absPath, config);
    }

    // Register — new workspaces start expanded
    const entry: WorkspaceRegistryEntry = {
      id: config.id || uniqueId,
      path: absPath,
      open: true,
    };
    this.registry.workspaces.push(entry);
    await this.saveRegistry();

    // Clear cache for this workspace
    this.configCache.delete(entry.id);

    const info = await this.getInfo(entry);
    if (!info) throw new Error('Failed to read workspace after creation');
    return info;
  }

  /**
   * Create a new workspace.
   * If `parentPath` is provided, the workspace directory is created there
   * (e.g. /Users/me/projects/my-app). Otherwise falls back to ~/.sero-ui/workspaces/.
   */
  async create(name: string, parentPath?: string): Promise<WorkspaceInfo> {
    if (parentPath) {
      const resolved = path.resolve(parentPath);
      const home = os.homedir();
      if (!resolved.startsWith(home + path.sep) && resolved !== home) {
        throw new Error(`Workspace parent path must be under the user home directory (${home})`);
      }
    }

    const id = slugify(name);
    const uniqueId = this.ensureUniqueId(id);
    const wsPath = parentPath
      ? path.join(path.resolve(parentPath), uniqueId)
      : path.join(WORKSPACES_DIR, uniqueId);

    await fs.mkdir(wsPath, { recursive: true });

    const config: WorkspaceConfig = {
      id: uniqueId,
      name,
    };
    await this.writeConfig(wsPath, config);

    const entry: WorkspaceRegistryEntry = {
      id: uniqueId,
      path: wsPath,
      open: true,
    };
    this.registry.workspaces.push(entry);
    await this.saveRegistry();

    const info = await this.getInfo(entry);
    if (!info) throw new Error('Failed to read workspace after creation');
    return info;
  }

  /**
   * Unregister a workspace. Does NOT delete the directory or config file.
   * Cannot remove the default workspace (global).
   */
  async remove(id: string): Promise<void> {
    if (id === 'global') {
      throw new Error(`Cannot remove default workspace: ${id}`);
    }

    this.registry.workspaces = this.registry.workspaces.filter((w) => w.id !== id);
    this.configCache.delete(id);
    await this.saveRegistry();

    // Clean up editor state file
    const editorStateFile = path.join(EDITOR_STATE_DIR, `${id}.json`);
    await fs.rm(editorStateFile, { force: true }).catch(() => {});
  }

  // ── Open / Close ────────────────────────────────────────────
  //
  // Presence in the registry = visible in sidebar.
  // `open` field = tree node expanded/collapsed.
  // `close` removes the workspace from the registry entirely.

  /** Expand a workspace tree node. Used by federated apps after creating a workspace. */
  async open(id: string): Promise<void> {
    await this.setExpanded(id, true);
  }

  /**
   * Remove a workspace from the registry (close = remove from sidebar).
   * Does NOT delete files. Re-add via addFolder to restore.
   */
  async close(id: string): Promise<void> {
    if (id === 'global') return; // Can't close default workspace
    this.registry.workspaces = this.registry.workspaces.filter((w) => w.id !== id);
    this.configCache.delete(id);
    await this.saveRegistry();

    // Clean up editor state file
    const editorStateFile = path.join(EDITOR_STATE_DIR, `${id}.json`);
    await fs.rm(editorStateFile, { force: true }).catch(() => {});
  }

  /** Set expanded/collapsed state for a workspace tree node. */
  async setExpanded(id: string, expanded: boolean): Promise<void> {
    const entry = this.findEntry(id);
    if (!entry) return;
    entry.open = expanded;
    await this.saveRegistry();
  }

  /** Get IDs of all registered workspaces. */
  getOpenIds(): string[] {
    return this.registry.workspaces.map((w) => w.id);
  }

  /** Infer the best workspace for a message (keywords vs contextHints/tags/names). */
  async inferWorkspace(message: string): Promise<string> {
    return inferWorkspaceFromMessage(message, await this.getOpenWorkspaces());
  }

  /** Get full WorkspaceInfo for all registered workspaces. */
  async getOpenWorkspaces(): Promise<WorkspaceInfo[]> {
    return this.list();
  }

  /** Find workspace by ID. */
  findEntry(id: string): WorkspaceRegistryEntry | undefined {
    return this.registry.workspaces.find((w) => w.id === id);
  }

  /** Find workspace by absolute path. */
  findByPath(absPath: string): WorkspaceRegistryEntry | undefined {
    const resolved = path.resolve(absPath);
    return this.registry.workspaces.find(
      (w) => path.resolve(w.path) === resolved,
    );
  }

  /** Get the resolved absolute path for a workspace. */
  getPath(id: string): string | undefined {
    return this.findEntry(id)?.path;
  }

  // ── Helpers ───────────────────────────────────────────────

  /** Check if a workspace has containers enabled. Defaults to true. */
  async isContainerEnabled(id: string): Promise<boolean> {
    const config = await this.getConfig(id);
    return config?.container !== false;
  }

  /** Enable or disable container mode for a workspace. Persisted to config file. */
  async setContainerEnabled(id: string, enabled: boolean): Promise<void> {
    const entry = this.findEntry(id);
    if (!entry) throw new Error(`Workspace not found: ${id}`);

    const config = await this.readConfig(entry.path);
    if (!config) throw new Error(`No config for workspace: ${id}`);

    config.container = enabled;
    await this.persistConfig(id, entry.path, config);
  }

  /** Write a modified config to disk and invalidate the cache. */
  async persistConfig(id: string, workspacePath: string, config: WorkspaceConfig): Promise<void> {
    this.configCache.delete(id);
    const configPath = path.join(workspacePath, '.sero-workspace.json');
    const json = JSON.stringify(config, null, 2) + '\n';
    await fs.writeFile(configPath, json, 'utf8');
  }

  // ── References & mounts (delegated to workspace-mounts.ts) ──

  getReferences(id: string) { return mounts.getReferences(this, id); }
  addReference(id: string, refId: string) { return mounts.addReference(this, id, refId); }
  removeReference(id: string, refId: string) { return mounts.removeReference(this, id, refId); }
  getMounts(id: string) { return mounts.getMounts(this, id); }
  addMount(id: string, p: string) { return mounts.addMount(this, id, p); }
  removeMount(id: string, p: string) { return mounts.removeMount(this, id, p); }

  // ── Additional roots (delegated to roots.ts) ──
  getRoots(id: string) { return roots.getRoots(this, id); }
  addRoot(id: string, input: Parameters<typeof roots.addRoot>[2]) {
    return roots.addRoot(this, id, input);
  }
  removeRoot(id: string, rootId: string) { return roots.removeRoot(this, id, rootId); }
  renameRoot(id: string, rootId: string, newName: string) {
    return roots.renameRoot(this, id, rootId, newName);
  }
  resolveRootPath(id: string, rootId: string) {
    return roots.resolveRootPath(this, id, rootId);
  }

  /** Merge registry entry + config into WorkspaceInfo. */
  private async getInfo(entry: WorkspaceRegistryEntry): Promise<WorkspaceInfo | null> {
    const config = await this.readConfig(entry.path);

    return {
      id: entry.id,
      name: config?.name || prettifyName(entry.id),
      path: entry.path,
      description: config?.description,
      contextHints: config?.contextHints,
      tags: config?.tags,
      open: entry.open,
      container: config?.container !== false,
      references: config?.references ?? [],
      mounts: config?.mounts ?? [],
      roots: config?.roots ?? [],
    };
  }

  /** Ensure an ID is unique in the registry. */
  private ensureUniqueId(baseId: string): string {
    const existing = new Set(this.registry.workspaces.map((w) => w.id));
    return ensureUniqueId(baseId, existing);
  }
}

// ── Singleton ────────────────────────────────────────────────

export const workspaceManager = new WorkspaceManager();
