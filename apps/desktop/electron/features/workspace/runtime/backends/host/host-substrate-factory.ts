import type { HostRuntimeSubstrate } from './host-substrate';
import { createPosixHostSubstrate } from './posix-substrate';

export function createHostSubstrate(
  _workspacePath: string,
  options: { platform?: NodeJS.Platform } = {},
): HostRuntimeSubstrate {
  const platform = options.platform ?? process.platform;
  if (platform === 'win32') {
    throw new Error('Host runtime is not supported on Windows. Use the Docker backend instead.');
  }
  return createPosixHostSubstrate({ platform });
}
