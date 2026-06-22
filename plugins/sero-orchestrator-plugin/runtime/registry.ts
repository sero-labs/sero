/**
 * Coordinator registry — shared between the app runtime (which populates it) and
 * the bridged extension tools/commands (which read it).
 *
 * IMPORTANT: the runtime entry and the extension entry are loaded by DIFFERENT
 * loaders (the runtime-loader bundles runtime/index.ts and inlines this module;
 * the Pi resource loader loads extension/index.ts separately). A plain
 * module-level Map would therefore exist as two distinct instances and the tool
 * would never see the coordinator the runtime registered. So the registry lives
 * on `globalThis`, which both module instances share in the Electron main
 * process (see 02-integration-seams.md, "CLI Bridge Boundary").
 */

import type { Coordinator } from './coordinator';

interface RegistryEntry {
  workspaceId: string;
  workspacePath: string;
  coordinator: Coordinator;
}

const REGISTRY_KEY = '__seroOrchestratorCoordinators__';

function store(): Map<string, RegistryEntry> {
  const globalScope = globalThis as Record<string, unknown>;
  const existing = globalScope[REGISTRY_KEY] as Map<string, RegistryEntry> | undefined;
  if (existing) return existing;
  const created = new Map<string, RegistryEntry>();
  globalScope[REGISTRY_KEY] = created;
  return created;
}

export function registerCoordinator(
  workspaceId: string,
  workspacePath: string,
  coordinator: Coordinator,
): void {
  store().set(workspaceId, { workspaceId, workspacePath, coordinator });
}

export function unregisterCoordinator(workspaceId: string): void {
  store().delete(workspaceId);
}

export function getCoordinator(workspaceId: string): Coordinator | undefined {
  return store().get(workspaceId)?.coordinator;
}

/**
 * Resolve a coordinator from a working directory. App-agent tool sessions run
 * with `cwd` set to the workspace root, so bridged tools resolve the workspace
 * by matching the cwd against each registered workspace path.
 */
export function resolveCoordinatorByCwd(cwd: string): Coordinator | undefined {
  const normalized = normalize(cwd);
  let best: RegistryEntry | undefined;
  for (const entry of store().values()) {
    const root = normalize(entry.workspacePath);
    if (normalized === root || normalized.startsWith(`${root}/`)) {
      if (!best || root.length > normalize(best.workspacePath).length) best = entry;
    }
  }
  return best?.coordinator;
}

/** Test/diagnostic helper. */
export function registeredWorkspaceIds(): string[] {
  return [...store().keys()];
}

function normalize(p: string): string {
  return p.replace(/\/+$/, '');
}
