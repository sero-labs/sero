import { PosixHostProcessAdapter } from './posix-process-adapter';
import type { HostProcessAdapter, HostProcessAdapterOptions } from './types';
import { WindowsHostProcessAdapter } from './windows-process-adapter';

export function createHostProcessAdapter(options: HostProcessAdapterOptions): HostProcessAdapter {
  return (options.platform ?? process.platform) === 'win32'
    ? new WindowsHostProcessAdapter(options.execFile)
    : new PosixHostProcessAdapter(options.execFile);
}
