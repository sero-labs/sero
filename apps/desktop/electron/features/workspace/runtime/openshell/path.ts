import path from 'path';

export const OPENSHELL_WORKSPACE_PARENT = '/sandbox/workspace';
const LEGACY_OPENSHELL_WORKSPACE_PARENT = '/workspace';

export function getOpenShellRuntimeWorkspacePath(workspacePath: string): string {
  return path.posix.join(OPENSHELL_WORKSPACE_PARENT, path.basename(workspacePath));
}

export function normalizeOpenShellRuntimeWorkspacePath(
  runtimeWorkspacePath: string | undefined,
  workspacePath: string,
): string {
  if (!runtimeWorkspacePath) return getOpenShellRuntimeWorkspacePath(workspacePath);
  if (runtimeWorkspacePath === LEGACY_OPENSHELL_WORKSPACE_PARENT) {
    return OPENSHELL_WORKSPACE_PARENT;
  }
  if (runtimeWorkspacePath.startsWith(`${LEGACY_OPENSHELL_WORKSPACE_PARENT}/`)) {
    return path.posix.join(
      OPENSHELL_WORKSPACE_PARENT,
      runtimeWorkspacePath.slice(LEGACY_OPENSHELL_WORKSPACE_PARENT.length + 1),
    );
  }
  return runtimeWorkspacePath;
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
