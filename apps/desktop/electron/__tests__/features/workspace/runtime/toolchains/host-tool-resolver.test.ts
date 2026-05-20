import { describe, expect, it, vi } from 'vitest';

import { HostToolResolver } from '@electron/features/workspace/runtime/toolchains/host-tool-resolver';
import type { ToolInstallReason, ToolName, ToolResolution, ToolStatus } from '@electron/features/workspace/runtime/toolchains/types';

const reason: ToolInstallReason = { kind: 'workspace-terminal', workspacePath: 'C:\\workspace' };

function resolution(tool: ToolName, path: string): ToolResolution {
  return { tool, source: 'system', path, version: '1.0.0' };
}

function createManager(shellPath: string) {
  return {
    resolve: vi.fn(async () => null),
    ensure: vi.fn(async (tool: ToolName) => resolution(tool, shellPath)),
    status: vi.fn(async (tool: ToolName): Promise<ToolStatus> => ({
      ...resolution(tool, shellPath),
      state: 'ready',
    })),
    binDirs: vi.fn(async () => []),
  };
}

describe('HostToolResolver terminal shell resolution', () => {
  it('rejects bare Windows shell names for terminal spawning', async () => {
    const manager = createManager('bash');
    const resolver = new HostToolResolver({ manager, platform: 'win32' });

    await expect(resolver.resolveTerminalShell(undefined, reason)).rejects.toThrow(
      'Git Bash executable not found',
    );
  });

  it('accepts absolute Windows Git Bash paths for terminal spawning', async () => {
    const manager = createManager('C:\\Program Files\\Git\\bin\\bash.exe');
    const resolver = new HostToolResolver({ manager, platform: 'win32' });

    await expect(resolver.resolveTerminalShell(undefined, reason)).resolves.toBe(
      'C:\\Program Files\\Git\\bin\\bash.exe',
    );
  });
});
