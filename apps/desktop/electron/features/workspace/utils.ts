/**
 * Utility helpers for workspace name/ID operations.
 *
 * Extracted from WorkspaceManager to keep file sizes manageable.
 */

import os from 'os';
import path from 'path';

import { assertSafeWorkspaceId, ensureUniqueId, isSafeWorkspaceId, workspaceSlug } from '@sero-ai/common';

// The id rule lives in `@sero-ai/common`, so the host and a plugin that must
// predict a workspace's destination cannot drift apart. Re-exported here because
// the workspace manager and its tests import these from this module.
export { assertSafeWorkspaceId, ensureUniqueId, isSafeWorkspaceId };

/** Convert a string to a kebab-case slug. Output always satisfies `isSafeWorkspaceId`. */
export const slugify = workspaceSlug;

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
  // Guard the *raw* input: path.resolve() always yields an absolute path, so a
  // relative registry entry would otherwise be silently joined to the cwd.
  if (!path.isAbsolute(targetPath) || forbidden.has(resolved)) {
    throw new Error(`Refusing to delete unsafe workspace path: ${resolved}`);
  }
}
