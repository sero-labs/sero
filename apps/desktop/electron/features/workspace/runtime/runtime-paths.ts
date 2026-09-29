import fs from 'fs';
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

/**
 * The path a runtime tool uses for a host directory. A directory inside the workspace is
 * under `/workspace`. Any other directory is where the runtime mounts it, at its own path.
 */
export function toRuntimeCwd(hostWorkspacePath: string, hostCwd: string): string {
  // A folder is often named by its real path while the workspace is registered by a link to it
  // (`/var` and `/private/var` on macOS), so try the workspace's real path as well.
  for (const root of new Set([hostWorkspacePath, realpathOrSelf(hostWorkspacePath)])) {
    const inside = toRuntimeWorkspacePath(root, hostCwd);
    if (inside) return inside;
  }
  return toRuntimeIdentityMountPath(hostCwd);
}

function realpathOrSelf(target: string): string {
  try {
    return fs.realpathSync(target);
  } catch {
    return target;
  }
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
