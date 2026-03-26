/**
 * Workspace references & arbitrary folder mounts.
 *
 * Extracted from WorkspaceManager to keep file size under 500 LOC.
 * All functions take a WorkspaceManager instance and delegate to
 * its public API (findEntry, readConfig, getConfig, persistConfig).
 */

import path from 'path';
import type { WorkspaceManager } from './manager';

// ── References (other workspaces) ────────────────────────────

/**
 * Get workspace references, filtering out stale IDs
 * (workspaces that no longer exist in the registry).
 */
export async function getReferences(mgr: WorkspaceManager, id: string): Promise<string[]> {
  const config = await mgr.getConfig(id);
  const refs = config?.references ?? [];
  return refs.filter((refId) => !!mgr.findEntry(refId));
}

/** Add a workspace reference. Prevents self-references and circular (mutual) references. */
export async function addReference(mgr: WorkspaceManager, id: string, refId: string): Promise<void> {
  if (id === refId) throw new Error('A workspace cannot reference itself');
  const entry = mgr.findEntry(id);
  if (!entry) throw new Error(`Workspace not found: ${id}`);
  if (!mgr.findEntry(refId)) throw new Error(`Referenced workspace not found: ${refId}`);

  // Prevent circular references: if the target already references us, block
  const targetRefs = await getReferences(mgr, refId);
  if (targetRefs.includes(id)) {
    throw new Error(`Circular reference: "${refId}" already references "${id}"`);
  }

  const config = await mgr.readConfig(entry.path);
  if (!config) throw new Error(`No config for workspace: ${id}`);

  const refs = config.references ?? [];
  if (refs.includes(refId)) return; // already referenced

  config.references = [...refs, refId];
  await mgr.persistConfig(id, entry.path, config);
}

/** Remove a workspace reference. */
export async function removeReference(mgr: WorkspaceManager, id: string, refId: string): Promise<void> {
  const entry = mgr.findEntry(id);
  if (!entry) throw new Error(`Workspace not found: ${id}`);

  const config = await mgr.readConfig(entry.path);
  if (!config) throw new Error(`No config for workspace: ${id}`);

  const refs = config.references ?? [];
  if (!refs.includes(refId)) return; // not referenced

  config.references = refs.filter((r) => r !== refId);
  await mgr.persistConfig(id, entry.path, config);
}

// ── Arbitrary folder mounts ──────────────────────────────────

/** Get arbitrary folder mounts for a workspace. */
export async function getMounts(mgr: WorkspaceManager, id: string): Promise<string[]> {
  const config = await mgr.getConfig(id);
  return config?.mounts ?? [];
}

/** Add an arbitrary host folder mount to a workspace's container. */
export async function addMount(mgr: WorkspaceManager, id: string, folderPath: string): Promise<void> {
  const entry = mgr.findEntry(id);
  if (!entry) throw new Error(`Workspace not found: ${id}`);

  const config = await mgr.readConfig(entry.path);
  if (!config) throw new Error(`No config for workspace: ${id}`);

  const resolved = path.resolve(folderPath);
  const mounts = config.mounts ?? [];
  if (mounts.includes(resolved)) return;

  config.mounts = [...mounts, resolved];
  await mgr.persistConfig(id, entry.path, config);
}

/** Remove an arbitrary folder mount from a workspace. */
export async function removeMount(mgr: WorkspaceManager, id: string, folderPath: string): Promise<void> {
  const entry = mgr.findEntry(id);
  if (!entry) throw new Error(`Workspace not found: ${id}`);

  const config = await mgr.readConfig(entry.path);
  if (!config) throw new Error(`No config for workspace: ${id}`);

  const resolved = path.resolve(folderPath);
  const mounts = config.mounts ?? [];
  if (!mounts.includes(resolved)) return;

  config.mounts = mounts.filter((m) => m !== resolved);
  await mgr.persistConfig(id, entry.path, config);
}
