import type { HostRuntimeSubstrate } from './host-substrate';
import { createPosixHostSubstrate } from './posix-substrate';
import { isWslUncPath } from './wsl-paths';
import { createWslHostSubstrate } from './wsl-substrate';

export function createHostSubstrate(
  workspacePath: string,
  options: { platform?: NodeJS.Platform } = {},
): HostRuntimeSubstrate {
  const platform = options.platform ?? process.platform;
  if (platform === 'win32' && isWslUncPath(workspacePath)) {
    return createWslHostSubstrate({ workspacePath });
  }
  return createPosixHostSubstrate({ platform });
}
