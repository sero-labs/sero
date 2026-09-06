/**
 * The bridge between the extension (which runs inside Pi sessions in the same
 * Electron main process) and the runtime. On `globalThis` because the two are
 * bundled by different loaders, on the Orchestrator registry precedent.
 */

import type { OwnerActions } from './owner-actions';
import type { ProjectsActions } from './projects-actions';

const KEY = 'sero-architect:runtime';

export interface ArchitectRegistryEntry {
  owner: OwnerActions;
  projects: ProjectsActions;
}

function slot(): { entry: ArchitectRegistryEntry | null } {
  const scope = globalThis as Record<string, unknown>;
  const existing = scope[KEY] as { entry: ArchitectRegistryEntry | null } | undefined;
  if (existing) return existing;
  const created = { entry: null };
  scope[KEY] = created;
  return created;
}

export function registerArchitectRuntime(entry: ArchitectRegistryEntry): void {
  slot().entry = entry;
}

export function unregisterArchitectRuntime(entry: ArchitectRegistryEntry): void {
  if (slot().entry === entry) slot().entry = null;
}

export function resolveArchitectRuntime(): ArchitectRegistryEntry | null {
  return slot().entry;
}
