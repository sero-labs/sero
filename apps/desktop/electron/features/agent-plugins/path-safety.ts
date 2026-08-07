import { promises as fs } from 'node:fs';
import path from 'node:path';

export function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function resolveContainedPath(root: string, target: string): Promise<string> {
  const realRoot = await fs.realpath(root);
  const realTarget = await fs.realpath(target);
  if (!isPathInside(realRoot, realTarget)) {
    throw new Error(`Package path resolves outside the Agent Plugin root: ${target}`);
  }
  return realTarget;
}

export async function resolveContainedFuturePath(root: string, target: string): Promise<string> {
  const absoluteRoot = path.resolve(root);
  const absoluteTarget = path.resolve(target);
  if (!isPathInside(absoluteRoot, absoluteTarget)) {
    throw new Error(`Configured path escapes its managed root: ${target}`);
  }
  const resolvedRoot = await fs.realpath(root);
  const resolvedTarget = path.resolve(resolvedRoot, path.relative(absoluteRoot, absoluteTarget));

  let existingPath = resolvedTarget;
  const missingSegments: string[] = [];
  while (existingPath !== resolvedRoot) {
    const realExistingPath = await fs.realpath(existingPath).then(
      (value) => value,
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      },
    );
    if (realExistingPath) {
      const resolvedFuturePath = path.join(realExistingPath, ...missingSegments);
      if (!isPathInside(resolvedRoot, resolvedFuturePath)) {
        throw new Error(`Configured path resolves outside its managed root: ${target}`);
      }
      return resolvedFuturePath;
    }
    missingSegments.unshift(path.basename(existingPath));
    existingPath = path.dirname(existingPath);
  }
  return path.join(resolvedRoot, ...missingSegments);
}
