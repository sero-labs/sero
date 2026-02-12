/**
 * WorkspaceManager — manages the workspace registry and configs.
 *
 * Registry lives at ~/.sero-ui/agent/workspaces.json.
 * Each workspace has a .sero-workspace.json at its root directory.
 *
 * Two default workspaces are created on first run:
 *   - scratchpad (ad-hoc tasks)
 *   - global (cross-cutting personal data)
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

import type {
  WorkspaceRegistryEntry,
  WorkspaceConfig,
  WorkspaceInfo,
} from '../src/types/ipc';

// ── Paths ────────────────────────────────────────────────────

const SERO_HOME = path.join(os.homedir(), '.sero-ui');
const SERO_AGENT_DIR = path.join(SERO_HOME, 'agent');
const REGISTRY_PATH = path.join(SERO_AGENT_DIR, 'workspaces.json');
const WORKSPACES_DIR = path.join(SERO_HOME, 'workspaces');

// ── Registry shape on disk ───────────────────────────────────

interface WorkspaceRegistry {
  workspaces: WorkspaceRegistryEntry[];
}

// ── Default workspace configs ────────────────────────────────

const DEFAULT_SCRATCHPAD_CONFIG: WorkspaceConfig = {
  id: 'scratchpad',
  name: 'Scratchpad',
  description: 'Ad-hoc tasks and quick questions',
  contextHints: ['General-purpose workspace for quick tasks'],
  tags: ['default', 'general'],
};

const DEFAULT_GLOBAL_CONFIG: WorkspaceConfig = {
  id: 'global',
  name: 'Global',
  description: 'Cross-cutting personal data — knowledge, finance, contacts, templates',
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
      this.registry = {
        workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
      };
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

  /** Create scratchpad + global if they don't exist. */
  private async ensureDefaults(): Promise<void> {
    let changed = false;

    // Scratchpad
    if (!this.findEntry('scratchpad')) {
      const scratchpadPath = path.join(WORKSPACES_DIR, 'scratchpad');
      await fs.mkdir(scratchpadPath, { recursive: true });
      await this.writeConfig(scratchpadPath, DEFAULT_SCRATCHPAD_CONFIG);
      this.registry.workspaces.push({
        id: 'scratchpad',
        path: scratchpadPath,
        autoOpen: true,
      });
      changed = true;
    }

    // Global
    if (!this.findEntry('global')) {
      const globalPath = path.join(WORKSPACES_DIR, 'global');
      await fs.mkdir(globalPath, { recursive: true });
      // Create conventional subdirectories
      await fs.mkdir(path.join(globalPath, 'knowledge'), { recursive: true });
      await fs.mkdir(path.join(globalPath, 'finance'), { recursive: true });
      await fs.mkdir(path.join(globalPath, 'templates'), { recursive: true });
      await this.writeConfig(globalPath, DEFAULT_GLOBAL_CONFIG);
      this.registry.workspaces.push({
        id: 'global',
        path: globalPath,
        autoOpen: true,
      });
      changed = true;
    }

    if (changed) {
      await this.saveRegistry();
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
    const id = this.slugify(path.basename(absPath));
    const uniqueId = this.ensureUniqueId(id);

    // Check if already registered (by path)
    const existing = this.registry.workspaces.find(
      (w) => path.resolve(w.path) === absPath,
    );
    if (existing) {
      const info = await this.getInfo(existing);
      if (info) return info;
      throw new Error(`Workspace at ${absPath} is registered but unreadable`);
    }

    // Read or create config
    let config = await this.readConfig(absPath);
    if (!config) {
      config = {
        id: uniqueId,
        name: name || this.prettifyName(path.basename(absPath)),
      };
      await this.writeConfig(absPath, config);
    }

    // Register
    const entry: WorkspaceRegistryEntry = {
      id: config.id || uniqueId,
      path: absPath,
      autoOpen: false,
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
   * Create a new workspace under ~/.sero-ui/workspaces/.
   */
  async create(name: string): Promise<WorkspaceInfo> {
    const id = this.slugify(name);
    const uniqueId = this.ensureUniqueId(id);
    const wsPath = path.join(WORKSPACES_DIR, uniqueId);

    await fs.mkdir(wsPath, { recursive: true });

    const config: WorkspaceConfig = {
      id: uniqueId,
      name,
    };
    await this.writeConfig(wsPath, config);

    const entry: WorkspaceRegistryEntry = {
      id: uniqueId,
      path: wsPath,
      autoOpen: false,
    };
    this.registry.workspaces.push(entry);
    await this.saveRegistry();

    const info = await this.getInfo(entry);
    if (!info) throw new Error('Failed to read workspace after creation');
    return info;
  }

  /**
   * Unregister a workspace. Does NOT delete the directory or config file.
   * Cannot remove default workspaces (scratchpad, global).
   */
  async remove(id: string): Promise<void> {
    if (id === 'scratchpad' || id === 'global') {
      throw new Error(`Cannot remove default workspace: ${id}`);
    }

    this.registry.workspaces = this.registry.workspaces.filter((w) => w.id !== id);
    this.configCache.delete(id);
    await this.saveRegistry();
  }

  /** Set the autoOpen flag for a workspace. */
  async setAutoOpen(id: string, autoOpen: boolean): Promise<void> {
    const entry = this.findEntry(id);
    if (!entry) throw new Error(`Workspace not found: ${id}`);
    entry.autoOpen = autoOpen;
    await this.saveRegistry();
  }

  /** Get workspace IDs that should auto-open on launch. */
  getAutoOpenIds(): string[] {
    return this.registry.workspaces
      .filter((w) => w.autoOpen)
      .map((w) => w.id);
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

  /** Merge registry entry + config into WorkspaceInfo. */
  private async getInfo(entry: WorkspaceRegistryEntry): Promise<WorkspaceInfo | null> {
    const config = await this.readConfig(entry.path);

    return {
      id: entry.id,
      name: config?.name || this.prettifyName(entry.id),
      path: entry.path,
      description: config?.description,
      contextHints: config?.contextHints,
      tags: config?.tags,
      autoOpen: entry.autoOpen,
    };
  }

  /** Convert a string to a kebab-case slug. */
  private slugify(input: string): string {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      || 'workspace';
  }

  /** Ensure an ID is unique in the registry. Appends -2, -3, etc. if needed. */
  private ensureUniqueId(baseId: string): string {
    const existing = new Set(this.registry.workspaces.map((w) => w.id));
    if (!existing.has(baseId)) return baseId;

    let n = 2;
    while (existing.has(`${baseId}-${n}`)) n++;
    return `${baseId}-${n}`;
  }

  /** Convert a slug/folder name into a display name. */
  private prettifyName(slug: string): string {
    return slug
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

// ── Singleton ────────────────────────────────────────────────

export const workspaceManager = new WorkspaceManager();
