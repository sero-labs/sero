// Main-process coordinator registry — the bridge that lets the Pi extension
// (bridged CLI tools/commands that receive no `host.*`) reach the single
// executor that lives in the background runtime (00-architecture.md, D-01).
//
// Why this lives in `shared/` rather than `runtime/`: the extension is
// Pi-CLI-safe and may only import from `shared/` (its tsconfig excludes
// `runtime/`, which depends on Sero-only `@sero-ai/common`). The registry is
// the one seam both surfaces must touch, so it lives here. It is a process-wide
// `globalThis` singleton (Electron main is a single process — agent-tool,
// host-bridge, and runtime code all land there), so a coordinator registered by
// the runtime is the same instance a bridged tool resolves. Pure JS with no
// imports keeps it Pi-safe.

import type { OrchestratorAction, OrchestratorActionResult } from './types';

/**
 * The single executor for one workspace. Tools/UI/CLI only ever call
 * `requestAction`; they never run attempts themselves (Principle 1, D-01).
 */
export interface OrchestratorCoordinator {
  requestAction(action: OrchestratorAction): Promise<OrchestratorActionResult>;
}

export interface OrchestratorCoordinatorRegistry {
  /** Register a coordinator for a workspace. Indexed by id and absolute path. */
  register(
    workspaceId: string,
    workspacePath: string,
    coordinator: OrchestratorCoordinator,
  ): void;
  unregister(workspaceId: string): void;
  /** Resolve by workspace id (CLI bridge path provides this). */
  get(workspaceId: string): OrchestratorCoordinator | null;
  /**
   * Resolve by workspace id OR absolute workspace path. The structured tool
   * path (useAppTools / app-agent) supplies only `cwd` (= workspace path), so
   * either key must work.
   */
  resolve(workspaceIdOrPath: string): OrchestratorCoordinator | null;
}

interface RegistryEntry {
  workspaceId: string;
  workspacePath: string;
  coordinator: OrchestratorCoordinator;
}

function normalizePath(p: string): string {
  // Strip a single trailing slash so `/ws` and `/ws/` resolve identically.
  // Both sides derive the path from the same workspaceManager, so heavier
  // normalization (no node:path, to stay Pi-safe) is unnecessary.
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
}

class CoordinatorRegistry implements OrchestratorCoordinatorRegistry {
  private readonly byId = new Map<string, RegistryEntry>();
  private readonly byPath = new Map<string, RegistryEntry>();

  register(
    workspaceId: string,
    workspacePath: string,
    coordinator: OrchestratorCoordinator,
  ): void {
    const entry: RegistryEntry = { workspaceId, workspacePath, coordinator };
    this.byId.set(workspaceId, entry);
    this.byPath.set(normalizePath(workspacePath), entry);
  }

  unregister(workspaceId: string): void {
    const entry = this.byId.get(workspaceId);
    if (!entry) return;
    this.byId.delete(workspaceId);
    this.byPath.delete(normalizePath(entry.workspacePath));
  }

  get(workspaceId: string): OrchestratorCoordinator | null {
    return this.byId.get(workspaceId)?.coordinator ?? null;
  }

  resolve(workspaceIdOrPath: string): OrchestratorCoordinator | null {
    const byId = this.byId.get(workspaceIdOrPath);
    if (byId) return byId.coordinator;
    const byPath = this.byPath.get(normalizePath(workspaceIdOrPath));
    return byPath?.coordinator ?? null;
  }
}

const REGISTRY_KEY = '__seroOrchestratorCoordinatorRegistry';

/** Resolve the process-wide coordinator registry, creating it on first use. */
export function getOrchestratorRegistry(): OrchestratorCoordinatorRegistry {
  const globalRecord = globalThis as Record<string, unknown>;
  const existing = globalRecord[REGISTRY_KEY];
  if (existing) return existing as OrchestratorCoordinatorRegistry;
  const registry = new CoordinatorRegistry();
  globalRecord[REGISTRY_KEY] = registry;
  return registry;
}
