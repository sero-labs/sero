import type { HostToolResolverLike } from '../../toolchains/host-tool-resolver';
import type { HostRuntimeSubstrate } from './host-substrate';
import { createPosixHostSubstrate } from './posix-substrate';
import { createWindowsHostSubstrate } from './windows-substrate';

export function createHostSubstrate(
  _workspacePath: string,
  options: { platform?: NodeJS.Platform; tools?: HostToolResolverLike } = {},
): HostRuntimeSubstrate {
  const platform = options.platform ?? process.platform;
  if (platform === 'win32') {
    return createWindowsHostSubstrate({ tools: options.tools });
  }
  return createPosixHostSubstrate({ platform, tools: options.tools });
}
