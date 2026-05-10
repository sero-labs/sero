import type { HostRuntimeSubstrate } from './host-substrate';
import { createPosixHostSubstrate } from './posix-substrate';
import { isWindowsDrivePath, isWslUncPath } from './wsl-paths';
import { createWindowsDriveHostSubstrate } from './windows-drive-substrate';
import { createWslHostSubstrate } from './wsl-substrate';

export function createHostSubstrate(
  workspacePath: string,
  options: { platform?: NodeJS.Platform } = {},
): HostRuntimeSubstrate {
  const platform = options.platform ?? process.platform;
  if (platform === 'win32') {
    if (isWslUncPath(workspacePath)) return createWslHostSubstrate({ workspacePath });
    if (isWindowsDrivePath(workspacePath)) return createWindowsDriveHostSubstrate({ workspacePath });
  }
  return createPosixHostSubstrate({ platform });
}
