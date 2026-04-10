import { realpathSync } from 'fs';
import path from 'path';

import { PRIMARY_ROOT_ID } from '@electron/features/workspace/roots';
import type { WorkspaceManager } from '@electron/features/workspace/manager';

export const PRIMARY_ROOT_PREFIX = `/${PRIMARY_ROOT_ID}`;

/** Maximum allowed path length (prevents DoS via absurdly long paths). */
const MAX_PATH_LENGTH = 4096;

export interface ResolvedVirtualPath {
  rootId: string;
  rootHostPath: string;
  resolvedHostPath: string;
  relativeToRoot: string;
  isPrimaryRoot: boolean;
}

/**
 * Split a virtual path into `<rootId>` + remainder.
 *
 * - `/workspace/foo`   → `{ rootId: 'workspace', rest: '/foo' }`
 * - `/sero-source/x`   → `{ rootId: 'sero-source', rest: '/x' }`
 * - `/workspace`       → `{ rootId: 'workspace', rest: '' }`
 * - `foo/bar` (legacy) → `{ rootId: null, rest: 'foo/bar' }`
 */
function splitVirtualPath(virtualPath: string): { rootId: string | null; rest: string } {
  if (!virtualPath.startsWith('/')) return { rootId: null, rest: virtualPath };
  const trimmed = virtualPath.slice(1);
  const slash = trimmed.indexOf('/');
  if (slash === -1) return { rootId: trimmed || null, rest: '' };
  return { rootId: trimmed.slice(0, slash), rest: trimmed.slice(slash) };
}

/** Apply baseline path validation (null bytes, length). */
function validatePathBasics(filePath: string): void {
  if (filePath.includes('\0')) {
    throw new Error('Path contains null bytes');
  }
  if (filePath.length > MAX_PATH_LENGTH) {
    throw new Error(`Path too long (max ${MAX_PATH_LENGTH} characters)`);
  }
}

/**
 * Resolve a relative path against a host root and apply the sandbox checks.
 */
function resolveAgainstRoot(rootHostPath: string, relative: string, originalForError: string): string {
  const raw = path.join(rootHostPath, relative);
  const resolved = path.resolve(raw);
  const root = path.resolve(rootHostPath);

  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`Path escapes workspace: ${originalForError}`);
  }

  try {
    const realResolved = realpathSync(resolved);
    const realRoot = realpathSync(root);
    if (!realResolved.startsWith(realRoot + path.sep) && realResolved !== realRoot) {
      throw new Error(`Symlink escapes workspace: ${originalForError}`);
    }
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist yet — path.resolve() check above is sufficient.
    } else if (err instanceof Error && err.message.includes('escapes workspace')) {
      throw err;
    }
    // Other errors bubble at the actual fs call site.
  }

  return resolved;
}

function toRelativePosix(rootHostPath: string, resolvedHostPath: string): string {
  const relative = path.relative(path.resolve(rootHostPath), resolvedHostPath);
  if (!relative || relative === '.') return '';
  return relative.split(path.sep).join('/');
}

/**
 * Resolve a virtual editor path to its sandboxed host path and root metadata.
 *
 * Rooted paths must reference a known root; bare relative paths fall back to
 * the primary root for legacy callers.
 */
export async function resolveVirtualPath(
  workspaceManager: Pick<WorkspaceManager, 'getPath' | 'resolveRootPath'>,
  workspaceId: string,
  filePath: string,
): Promise<ResolvedVirtualPath> {
  validatePathBasics(filePath);

  const { rootId, rest } = splitVirtualPath(filePath);
  const effectiveRootId = rootId ?? PRIMARY_ROOT_ID;

  const rootHostPath = rootId
    ? await workspaceManager.resolveRootPath(workspaceId, rootId)
    : workspaceManager.getPath(workspaceId) ?? null;

  if (!rootHostPath) {
    if (!rootId || effectiveRootId === PRIMARY_ROOT_ID) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }
    throw new Error(`Unknown workspace root: ${effectiveRootId}`);
  }

  const relative = rootId ? rest : filePath;
  const resolvedHostPath = resolveAgainstRoot(rootHostPath, relative, filePath);

  return {
    rootId: effectiveRootId,
    rootHostPath: path.resolve(rootHostPath),
    resolvedHostPath,
    relativeToRoot: toRelativePosix(rootHostPath, resolvedHostPath),
    isPrimaryRoot: effectiveRootId === PRIMARY_ROOT_ID,
  };
}

/** Translate a virtual path to the absolute host path used in host mode. */
export async function toHostPath(
  workspaceManager: Pick<WorkspaceManager, 'getPath' | 'resolveRootPath'>,
  workspaceId: string,
  filePath: string,
): Promise<string> {
  return (await resolveVirtualPath(workspaceManager, workspaceId, filePath)).resolvedHostPath;
}

/**
 * Translate a virtual path to the path the container should see.
 *
 * - Primary-root paths resolve under `/workspace` inside the container.
 * - Additional roots resolve to their bind-mounted host absolute path.
 */
export async function toContainerPath(
  workspaceManager: Pick<WorkspaceManager, 'getPath' | 'resolveRootPath'>,
  workspaceId: string,
  filePath: string,
): Promise<string> {
  const resolved = await resolveVirtualPath(workspaceManager, workspaceId, filePath);

  if (!resolved.isPrimaryRoot) {
    return resolved.resolvedHostPath;
  }

  return resolved.relativeToRoot
    ? path.posix.join(PRIMARY_ROOT_PREFIX, resolved.relativeToRoot)
    : PRIMARY_ROOT_PREFIX;
}
