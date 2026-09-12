/**
 * Canonical host path resolution.
 *
 * A target may not exist yet, so resolve the nearest existing parent and append
 * the missing segments. Host tools and the host side of a live-mounted
 * container use this one function, so both produce the same identity for a
 * shared file even when the workspace path contains a symlink.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export function normalizeHostPath(value: string): string {
  return path.resolve(value).replace(/\\/g, '/');
}

function isMissingPathError(error: unknown): boolean {
  return !!error
    && typeof error === 'object'
    && 'code' in error
    && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

export async function canonicalizeHostPath(candidatePath: string): Promise<string> {
  let current = normalizeHostPath(candidatePath);
  const missingSegments: string[] = [];

  while (true) {
    try {
      const resolved = normalizeHostPath(await fs.realpath(current));
      return missingSegments.length > 0
        ? normalizeHostPath(path.join(resolved, ...missingSegments.reverse()))
        : resolved;
    } catch (error) {
      if (!isMissingPathError(error)) {
        return normalizeHostPath(candidatePath);
      }

      const parent = path.dirname(current);
      if (parent === current) {
        return normalizeHostPath(candidatePath);
      }

      missingSegments.push(path.basename(current));
      current = parent;
    }
  }
}
