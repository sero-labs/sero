import path from 'path';

export const OPENSHELL_WORKSPACE_PARENT = '/workspace';

export function getOpenShellRuntimeWorkspacePath(workspacePath: string): string {
  return path.posix.join(OPENSHELL_WORKSPACE_PARENT, path.basename(workspacePath));
}

export function toOpenShellWorkspacePath(workspacePath: string, cwd: string): string | null {
  const relativePath = path.relative(workspacePath, cwd);
  if (relativePath === '') return getOpenShellRuntimeWorkspacePath(workspacePath);
  if (
    relativePath === '.' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }
  return path.posix.join(
    getOpenShellRuntimeWorkspacePath(workspacePath),
    ...relativePath.split(path.sep),
  );
}
