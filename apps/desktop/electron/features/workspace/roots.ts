/**
 * Workspace additional roots — multi-root workspace support.
 *
 * The workspace's primary path is the implicit root id `"workspace"`.
 * Additional roots are stored on `WorkspaceConfig.roots` and exposed to
 * the renderer via the editor IPC `/<rootId>/...` virtual path scheme.
 *
 * Container parity: roots are NOT written into `config.mounts` (which is
 * reserved for user-managed explicit mounts). Instead, the container build
 * step (`workspace-container-config.ts`) merges `config.mounts` and the
 * resolved root paths into the writable bind-mount list. This keeps user
 * mounts and root mirrors completely independent so removing a root never
 * deletes a mount the user added explicitly.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { WorkspaceManager } from './manager';
import type { WorkspaceRoot } from '../../../src/types/ipc';
import { slugify, ensureUniqueId, prettifyName } from './utils';

/** Reserved id for the implicit primary root. */
export const PRIMARY_ROOT_ID = 'workspace';

/** Get all additional roots for a workspace (does not include the primary). */
export async function getRoots(mgr: WorkspaceManager, id: string): Promise<WorkspaceRoot[]> {
  const config = await mgr.getConfig(id);
  return (config?.roots ?? []).slice();
}

/**
 * Add a new root to a workspace.
 *
 * - Validates that `path` exists and is a directory.
 * - Generates a unique kebab-case id from the supplied name (or basename).
 * - Refuses to attach the workspace's own primary path or duplicate paths.
 *
 * Container parity is handled at container build time, not here — see the
 * file header for details.
 */
export async function addRoot(
  mgr: WorkspaceManager,
  id: string,
  input: { name: string; path: string; kind?: WorkspaceRoot['kind'] },
): Promise<WorkspaceRoot> {
  const entry = mgr.findEntry(id);
  if (!entry) throw new Error(`Workspace not found: ${id}`);

  const config = await mgr.readConfig(entry.path);
  if (!config) throw new Error(`No config for workspace: ${id}`);

  const resolved = path.resolve(input.path);
  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Not a directory: ${resolved}`);
  }

  // Reject re-adding the primary path or any existing root path
  if (path.resolve(entry.path) === resolved) {
    throw new Error(`Cannot add the workspace's own path as a root`);
  }
  const existingRoots = config.roots ?? [];
  if (existingRoots.some((r) => path.resolve(r.path) === resolved)) {
    throw new Error(`Root already attached: ${resolved}`);
  }

  // Generate a unique slug, avoiding the reserved primary id
  const reserved = new Set<string>([PRIMARY_ROOT_ID, ...existingRoots.map((r) => r.id)]);
  const baseSlug = slugify(input.name || path.basename(resolved));
  const rootId = ensureUniqueId(baseSlug === PRIMARY_ROOT_ID ? `${baseSlug}-2` : baseSlug, reserved);

  const newRoot: WorkspaceRoot = {
    id: rootId,
    name: input.name || prettifyName(path.basename(resolved)),
    path: resolved,
    kind: input.kind ?? 'folder',
  };

  config.roots = [...existingRoots, newRoot];
  await mgr.persistConfig(id, entry.path, config);

  return newRoot;
}

/**
 * Remove a root from a workspace.
 *
 * Only mutates `config.roots`. `config.mounts` is owned by the user — the
 * container build step picks up roots independently, so removing a root
 * never touches a user-added explicit mount even when the paths overlap.
 */
export async function removeRoot(mgr: WorkspaceManager, id: string, rootId: string): Promise<void> {
  if (rootId === PRIMARY_ROOT_ID) {
    throw new Error(`Cannot remove the primary workspace root`);
  }
  const entry = mgr.findEntry(id);
  if (!entry) throw new Error(`Workspace not found: ${id}`);

  const config = await mgr.readConfig(entry.path);
  if (!config) throw new Error(`No config for workspace: ${id}`);

  const existingRoots = config.roots ?? [];
  if (!existingRoots.some((r) => r.id === rootId)) return;

  config.roots = existingRoots.filter((r) => r.id !== rootId);
  await mgr.persistConfig(id, entry.path, config);
}

/** Rename the display name of an existing root. The id is immutable. */
export async function renameRoot(
  mgr: WorkspaceManager,
  id: string,
  rootId: string,
  newName: string,
): Promise<void> {
  if (rootId === PRIMARY_ROOT_ID) {
    throw new Error(`Cannot rename the primary workspace root via this API`);
  }
  const trimmed = newName.trim();
  if (!trimmed) throw new Error(`Root name cannot be empty`);

  const entry = mgr.findEntry(id);
  if (!entry) throw new Error(`Workspace not found: ${id}`);

  const config = await mgr.readConfig(entry.path);
  if (!config) throw new Error(`No config for workspace: ${id}`);

  const existingRoots = config.roots ?? [];
  const idx = existingRoots.findIndex((r) => r.id === rootId);
  if (idx === -1) throw new Error(`Root not found: ${rootId}`);

  const updated: WorkspaceRoot = { ...existingRoots[idx], name: trimmed };
  config.roots = [...existingRoots.slice(0, idx), updated, ...existingRoots.slice(idx + 1)];
  await mgr.persistConfig(id, entry.path, config);
}

/**
 * Resolve a root id to its absolute host path. Returns the workspace's
 * primary path for `"workspace"`, or `null` if the root id is unknown.
 */
export async function resolveRootPath(
  mgr: WorkspaceManager,
  workspaceId: string,
  rootId: string,
): Promise<string | null> {
  if (rootId === PRIMARY_ROOT_ID) {
    return mgr.getPath(workspaceId) ?? null;
  }
  const config = await mgr.getConfig(workspaceId);
  const root = config?.roots?.find((r) => r.id === rootId);
  return root ? path.resolve(root.path) : null;
}
