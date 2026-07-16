/**
 * Utility helpers for workspace name/ID operations.
 *
 * Extracted from WorkspaceManager to keep file sizes manageable.
 */

import os from 'os';
import path from 'path';

// Workspace IDs are interpolated into dev-server IDs as the first colon-separated segment
// (see runtime-manager `workspaceIdFromServerId`), so they must not themselves contain colons.
// Slugify enforces this by construction; the regex below is the runtime guard for any path
// that hands IDs in from disk, IPC, or legacy migrations.
const SAFE_WORKSPACE_ID = /^[a-z0-9][a-z0-9-]*$/;

/** Convert a string to a kebab-case slug. Output always satisfies `isSafeWorkspaceId`. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'workspace';
}

/** Returns true if the value is a safe workspace ID (colon-free, lowercase kebab-case). */
export function isSafeWorkspaceId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_WORKSPACE_ID.test(value);
}

/**
 * Throws when the ID would be unsafe to interpolate into dev-server/runtime identifiers.
 * Use at trust boundaries (registry load, IPC) so malformed IDs fail loudly.
 */
export function assertSafeWorkspaceId(value: string): void {
  if (!isSafeWorkspaceId(value)) {
    throw new Error(`Invalid workspace id: ${JSON.stringify(value)} (must match ${SAFE_WORKSPACE_ID})`);
  }
}

/** Ensure an ID is unique within a set of existing IDs. Appends -2, -3, etc. if needed. */
export function ensureUniqueId(baseId: string, existingIds: Set<string>): string {
  assertSafeWorkspaceId(baseId);
  if (!existingIds.has(baseId)) return baseId;

  let n = 2;
  while (existingIds.has(`${baseId}-${n}`)) n++;
  return `${baseId}-${n}`;
}

/** Convert a slug/folder name into a display name (e.g. "my-app" → "My App"). */
export function prettifyName(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Defence-in-depth against a malformed registry pointing a workspace at a
 * dangerous path. Deletion is only ever allowed for a real, absolute, nested
 * directory — never the filesystem root, the user's home, or the Sero home.
 */
export function assertSafeToDelete(targetPath: string, seroHome: string): void {
  const resolved = path.resolve(targetPath);
  const forbidden = new Set([path.parse(resolved).root, os.homedir(), path.resolve(seroHome)]);
  if (!path.isAbsolute(resolved) || forbidden.has(resolved)) {
    throw new Error(`Refusing to delete unsafe workspace path: ${resolved}`);
  }
}
