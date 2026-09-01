/**
 * One canonical identity for a workspace's checkout root.
 *
 * A workspace can be opened through a symlink (`/tmp/link -> /tmp/real` is the
 * common macOS `/tmp` case). Resolving the child of a comparison but not its
 * parent then makes a perfectly healthy checkout look like it lives outside
 * the pool, and reattachment is refused for a repository that is entirely
 * fine. So the root is resolved ONCE, and the same resolved spelling is used
 * for allocation, persistence, enumeration, legacy adoption and containment.
 *
 * The root is created before it is resolved: `realpath` needs the directory to
 * exist, and a path resolved before creation necessarily falls back to the
 * unresolved spelling — which is exactly the inconsistency this avoids.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { canonicalPath } from './repository';

/** Directory within a workspace where physical checkouts live. */
export const WORKTREES_DIR = path.join('.sero', 'worktrees');

export const SLOT_DIR_PREFIX = 'slot-';
export const LEGACY_DIR_PREFIX = 'card-';

/** The unresolved spelling. Only the legacy manager addresses checkouts this way. */
export function worktreesRoot(workspacePath: string): string {
  return path.join(workspacePath, WORKTREES_DIR);
}

/** Creates and resolves the checkout root, so every later comparison agrees. */
export async function canonicalWorktreesRoot(workspacePath: string): Promise<string> {
  const root = worktreesRoot(workspacePath);
  await fs.mkdir(root, { recursive: true }).catch(() => undefined);
  return canonicalPath(root);
}
