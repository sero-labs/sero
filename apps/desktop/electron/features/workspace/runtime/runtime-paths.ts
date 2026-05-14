import path from 'path';

export const RUNTIME_WORKSPACE_PATH = '/workspace';

export function normalizeRuntimePath(runtimePath: string): string {
  const absolutePath = runtimePath.startsWith('/')
    ? runtimePath
    : path.posix.join(RUNTIME_WORKSPACE_PATH, runtimePath);
  return path.posix.normalize(absolutePath);
}

export function isRuntimeWorkspacePath(runtimePath: string): boolean {
  const normalizedPath = normalizeRuntimePath(runtimePath);
  return normalizedPath === RUNTIME_WORKSPACE_PATH
    || normalizedPath.startsWith(`${RUNTIME_WORKSPACE_PATH}/`);
}

export function toRuntimeWorkspacePath(
  hostWorkspacePath: string,
  hostPath: string,
): string | null {
  const relativePath = path.relative(hostWorkspacePath, hostPath);
  if (relativePath === '') return RUNTIME_WORKSPACE_PATH;
  if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    return null;
  }
  return path.posix.join(RUNTIME_WORKSPACE_PATH, ...relativePath.split(path.sep));
}

export function toHostWorkspacePath(
  hostWorkspacePath: string,
  runtimePath: string,
): string {
  const normalizedPath = normalizeRuntimePath(runtimePath);
  if (!isRuntimeWorkspacePath(normalizedPath)) {
    throw new Error(`Runtime path must be inside ${RUNTIME_WORKSPACE_PATH}: ${runtimePath}`);
  }

  const relativePath = path.posix.relative(RUNTIME_WORKSPACE_PATH, normalizedPath);
  if (!relativePath) return hostWorkspacePath;
  return path.join(hostWorkspacePath, ...relativePath.split('/'));
}

export function toRuntimeIdentityMountPath(hostPath: string): string {
  if (/^[A-Za-z]:[\\/]/.test(hostPath)) {
    const drive = hostPath[0].toLowerCase();
    const rest = hostPath.slice(2).replace(/\\/g, '/').replace(/^\/+/, '');
    return `/mnt/${drive}/${rest}`;
  }
  return hostPath.replace(/\\/g, '/');
}
