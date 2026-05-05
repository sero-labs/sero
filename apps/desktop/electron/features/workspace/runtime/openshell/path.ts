import path from 'path';

export const OPENSHELL_WORKSPACE_PARENT = '/sandbox/workspace';

export function getOpenShellRuntimeWorkspacePath(workspacePath: string): string {
  return path.posix.join(OPENSHELL_WORKSPACE_PARENT, path.basename(workspacePath));
}

export function toOpenShellWorkspacePath(
  workspacePath: string,
  cwd: string,
  runtimeWorkspacePath = getOpenShellRuntimeWorkspacePath(workspacePath),
): string | null {
  const relativePath = path.relative(workspacePath, cwd);
  if (relativePath === '') return runtimeWorkspacePath;
  if (
    relativePath === '.' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }
  return path.posix.join(
    runtimeWorkspacePath,
    ...relativePath.split(path.sep),
  );
}
