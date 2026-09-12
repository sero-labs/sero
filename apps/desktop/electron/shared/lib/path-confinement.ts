import path from 'path';

/**
 * Path confinement checks shared by the IPC handlers that unlink or read a file
 * by an absolute path.
 *
 * These live outside the session handlers so a module that only needs the check
 * does not pull in the workspace manager.
 */

export interface PathTools {
  resolve(...paths: string[]): string;
  relative(from: string, to: string): string;
  isAbsolute(path: string): boolean;
}

export function isPathInsideDirectory(
  candidatePath: string,
  directoryPath: string,
  pathTools: PathTools = path,
): boolean {
  const relativePath = pathTools.relative(pathTools.resolve(directoryPath), pathTools.resolve(candidatePath));
  return relativePath === '' || (
    relativePath.length > 0
    && !relativePath.startsWith('..')
    && !pathTools.isAbsolute(relativePath)
  );
}
