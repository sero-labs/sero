import path from 'path';
import { WORKSPACE_MOUNT } from '@electron/features/container/core/types';

export function toWorkspaceContainerPath(
  workspacePath: string,
  targetPath: string,
): string | null {
  const relativePath = path.relative(workspacePath, targetPath);
  if (relativePath === '') return WORKSPACE_MOUNT;
  if (relativePath === '.' || relativePath.startsWith(`..${path.sep}`) || relativePath === '..') {
    return null;
  }
  return path.posix.join(WORKSPACE_MOUNT, ...relativePath.split(path.sep));
}
