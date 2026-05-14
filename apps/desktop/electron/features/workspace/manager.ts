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
} from '@/types/ipc';
import type { WorkspaceRuntimeBackend, WorkspaceRuntimeBackendInput, WorkspaceRuntimeConfig } from '@/types/workspace-runtime';
import type { SetContainerEnabledResult, WorkspaceManagerOptions, WorkspaceRegistry } from './manager-types';
export type { SetContainerEnabledResult, WorkspaceManagerOptions } from './manager-types';

import { inferWorkspaceFromMessage } from './inference';
import { slugify, ensureUniqueId, prettifyName, isSafeWorkspaceId } from './utils';
import { AGENT_DIR, DEFAULT_GLOBAL_CONFIG, EDITOR_STATE_DIR, REGISTRY_PATH, WORKSPACES_DIR } from './defaults';
import * as mounts from './mounts';
import * as roots from './roots';
import {
  normalizeWorkspaceConfigForWrite,
  resolveWorkspaceRuntimeBackendDetails,
  resolveWorkspaceRuntimeConfig,
  type WorkspaceRuntimeBackendDetails,
} from './runtime/config';
import { getDefaultRuntimeBackend } from './runtime/platform-default';
import { discoverManagedWorkspaceEntries, pathExists } from './registry-recovery';

export class WorkspaceManager {
  private registry: WorkspaceRegistry = { workspaces: [] };
  private configCache: Map<string, WorkspaceConfig> = new Map();
  private readonly registryPath: string;
  private readonly workspacesDir: string;
  private readonly agentDir: string;
  private readonly editorStateDir: string;

  constructor(private readonly options: WorkspaceManagerOptions = {}) {
    this.registryPath = options.registryPath ?? REGISTRY_PATH;
    this.workspacesDir = options.workspacesDir ?? WORKSPACES_DIR;
    this.agentDir = options.agentDir ?? AGENT_DIR;
    this.editorStateDir = options.editorStateDir ?? EDITOR_STATE_DIR;
  }

  /** Load registry from disk. Creates defaults if first run. */
  async init(): Promise<void> {
    await this.ensureDirs();
    await this.loadRegistry();
    await this.ensureDefaults();
    await this.recoverManagedWorkspaces();
    await this.migrateRuntimeConfig();
  }

  /** Ensure required directories exist. */
  private async ensureDirs(): Promise<void> {
    await fs.mkdir(this.agentDir, { recursive: true });
    await fs.mkdir(this.workspacesDir, { recursive: true });
  }

  /** Load registry from ~/.sero-ui/agent/workspaces.json. */
  private async loadRegistry(): Promise<void> {
    try {
      const raw = await fs.readFile(this.registryPath, 'utf8');
      const parsed = JSON.parse(raw) as WorkspaceRegistry;
      const rawWorkspaces = Array.isArray(parsed.workspaces) ? parsed.workspaces : [];
      const workspaces: WorkspaceRegistryEntry[] = [];

      // Migrate: autoOpen → open and drop entries with unsafe IDs so they cannot poison
      // dev-server ID parsing (workspace IDs must be colon-free; see runtime-manager).
      let migrated = false;
      for (const entry of rawWorkspaces) {
        if (!isSafeWorkspaceId(entry.id)) {
          console.warn(`[workspace] Dropping registry entry with unsafe id: ${JSON.stringify(entry.id)}`);
          migrated = true;
          continue;
        }
        if (!('open' in entry)) {
          const legacy = entry as unknown as Record<string, unknown>;
          (entry as WorkspaceRegistryEntry).open = legacy.autoOpen !== false;
          delete legacy.autoOpen;
          migrated = true;
        }
        workspaces.push(entry);
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
    await fs.writeFile(this.registryPath, json, 'utf8');
  }

  /** Create global workspace if it doesn't exist. */
  private async ensureDefaults(): Promise<void> {
    let changed = false;

    // Global
    if (!this.findEntry('global')) {
      const globalPath = path.join(this.workspacesDir, 'global');
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

  private async recoverManagedWorkspaces(): Promise<void> {
    const recovered = await discoverManagedWorkspaceEntries(this.workspacesDir, this.registry.workspaces);
    if (recovered.length === 0) return;
    this.registry.workspaces.push(...recovered);
    await this.saveRegistry();
  }

  /** Migrate legacy container flags to provider-aware runtime config. */
  private async migrateRuntimeConfig(): Promise<void> {
    for (const entry of this.registry.workspaces) {
      const config = await this.readConfig(entry.path);
      const runtimeBackend = config?.runtime?.backend as WorkspaceRuntimeBackendInput | undefined;
      // Deprecated compatibility input; normalize to host on write.
      if (!config || (runtimeBackend && runtimeBackend !== 'mac-host' && config.container === undefined)) continue;
      await this.writeConfig(entry.path, config);
      this.configCache.delete(entry.id);
    }
  }

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
    const json = JSON.stringify(normalizeWorkspaceConfigForWrite(config), null, 2) + '\n';
    await fs.writeFile(configPath, json, 'utf8');
  }

  private async cleanupEditorState(id: string): Promise<void> {
    const editorStateFile = path.join(this.editorStateDir, `${id}.json`);
    try {
      await fs.rm(editorStateFile, { force: true });
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') return;
      console.warn(`[workspace] Failed to remove editor state for ${id}:`, error);
    }
  }

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
    } else {
      const configuredId = isSafeWorkspaceId(config.id) ? config.id : uniqueId;
      const safeUniqueId = this.ensureUniqueId(configuredId);
      if (config.id !== safeUniqueId) {
        config = { ...config, id: safeUniqueId };
        await this.writeConfig(absPath, config);
      }
    }

    // Register — new workspaces start expanded
    const entry: WorkspaceRegistryEntry = {
      id: config.id,
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
      : path.join(this.workspacesDir, uniqueId);

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

    await this.cleanupEditorState(id);
  }

  // ── Open / Close ────────────────────────────────────────────
  //
  // Presence in the registry = visible in sidebar.
  // `open` field = tree node expanded/collapsed.
  // `close` removes the workspace from the registry entirely.

  /** Expand a workspace tree node. Used by federated apps after creating a workspace. */
  async open(id: string): Promise<void> {
    if (!this.findEntry(id)) {
      throw new Error(`Workspace not found: ${id}`);
    }
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

    await this.cleanupEditorState(id);
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

  async getRuntimeConfig(id: string): Promise<WorkspaceRuntimeConfig> {
    return resolveWorkspaceRuntimeConfig(id, await this.getConfig(id));
  }

  /**
   * Returns the validated backend the runtime manager will execute, alongside
   * the originally configured backend and any platform-fallback metadata. Used
   * by renderer-facing diagnostics so the audit and the runtime manager agree
   * on which backend is actually in play.
   */
  async getRuntimeBackendDetails(id: string): Promise<WorkspaceRuntimeBackendDetails> {
    return resolveWorkspaceRuntimeBackendDetails(id, await this.getConfig(id));
  }

  async setRuntimeBackend(id: string, backend: WorkspaceRuntimeBackend): Promise<void> {
    const entry = this.findEntry(id);
    if (!entry) throw new Error(`Workspace not found: ${id}`);

    const config = await this.readConfig(entry.path);
    if (!config) throw new Error(`No config for workspace: ${id}`);

    await this.persistConfig(id, entry.path, { ...config, runtime: { ...config.runtime, backend } });
  }

  /** @deprecated compatibility shim while callers migrate to runtime.backend. */
  async isContainerEnabled(id: string): Promise<boolean> {
    return (await this.getRuntimeConfig(id)).backend !== 'host';
  }

  /** @deprecated compatibility shim while callers migrate to runtime.backend. */
  async setContainerEnabled(id: string, enabled: boolean): Promise<SetContainerEnabledResult> {
    if (!enabled && process.platform === 'win32') {
      return {
        ok: false,
        error: { code: 'host-doctor-failed', message: 'Host runtime is not supported on Windows. Use the Docker backend instead.', checks: [] },
      };
    }
    const backend: WorkspaceRuntimeBackend = enabled ? getDefaultRuntimeBackend({ platform: process.platform, arch: process.arch }) : 'host';
    await this.setRuntimeBackend(id, backend);
    return { ok: true, backend };
  }

  /** Write a modified config to disk and invalidate the cache. */
  async persistConfig(id: string, workspacePath: string, config: WorkspaceConfig): Promise<void> {
    this.configCache.delete(id);
    const configPath = path.join(workspacePath, '.sero-workspace.json');
    const json = JSON.stringify(normalizeWorkspaceConfigForWrite(config), null, 2) + '\n';
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
    const [config, exists] = await Promise.all([this.readConfig(entry.path), pathExists(entry.path)]);
    const runtime = resolveWorkspaceRuntimeConfig(entry.id, config);

    return {
      id: entry.id,
      name: config?.name || prettifyName(entry.id),
      path: entry.path,
      description: config?.description,
      contextHints: config?.contextHints,
      tags: config?.tags,
      open: entry.open,
      runtime,
      container: runtime.backend !== 'host',
      references: config?.references ?? [],
      mounts: config?.mounts ?? [],
      roots: config?.roots ?? [],
      missing: !exists,
    };
  }

  /** Ensure an ID is unique in the registry. */
  private ensureUniqueId(baseId: string): string {
    const existing = new Set(this.registry.workspaces.map((w) => w.id));
    return ensureUniqueId(baseId, existing);
  }
}

export const workspaceManager = new WorkspaceManager();
