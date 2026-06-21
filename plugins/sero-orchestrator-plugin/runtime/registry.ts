/**
 * Coordinator registry — module-level singleton shared between the app runtime
 * (which populates it) and the bridged extension tools/commands (which read it).
 *
 * Both runtime/index.ts and extension/index.ts load into the same Electron-main
 * module realm, so this Map is genuinely shared (see 02-integration-seams.md,
 * "CLI Bridge Boundary"). Bridged contexts do not receive `host.*`; they look
 * up the coordinator here and call `requestAction`.
 */

import type { Coordinator } from './coordinator';

interface RegistryEntry {
  workspaceId: string;
  workspacePath: string;
  coordinator: Coordinator;
}

const byWorkspaceId = new Map<string, RegistryEntry>();

export function registerCoordinator(
  workspaceId: string,
  workspacePath: string,
  coordinator: Coordinator,
): void {
  byWorkspaceId.set(workspaceId, { workspaceId, workspacePath, coordinator });
}

export function unregisterCoordinator(workspaceId: string): void {
  byWorkspaceId.delete(workspaceId);
}

export function getCoordinator(workspaceId: string): Coordinator | undefined {
  return byWorkspaceId.get(workspaceId)?.coordinator;
}

/**
 * Resolve a coordinator from a working directory. App-agent tool sessions run
 * with `cwd` set to the workspace root, so bridged tools resolve the workspace
 * by matching the cwd against each registered workspace path.
 */
export function resolveCoordinatorByCwd(cwd: string): Coordinator | undefined {
  const normalized = normalize(cwd);
  let best: RegistryEntry | undefined;
  for (const entry of byWorkspaceId.values()) {
    const root = normalize(entry.workspacePath);
    if (normalized === root || normalized.startsWith(`${root}/`)) {
      if (!best || root.length > normalize(best.workspacePath).length) best = entry;
    }
  }
  return best?.coordinator;
}

/** Test/diagnostic helper. */
export function registeredWorkspaceIds(): string[] {
  return [...byWorkspaceId.keys()];
}

function normalize(p: string): string {
  return p.replace(/\/+$/, '');
}
