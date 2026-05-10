import { describe, expect, it } from 'vitest';
import { createHostSubstrate } from '@electron/features/workspace/runtime/backends/host/host-substrate-factory';

describe('createHostSubstrate', () => {
  it('uses Node fs POSIX substrate for Windows-native drive workspaces', () => {
    const substrate = createHostSubstrate('C:\\Users\\me\\repo', { platform: 'win32' });

    expect(substrate.kind).toBe('posix');
  });

  it('uses WSL substrate file primitives for WSL UNC workspaces', () => {
    const substrate = createHostSubstrate('\\\\wsl$\\Ubuntu\\home\\me\\repo', { platform: 'win32' });

    expect(substrate.kind).toBe('wsl');
    expect(substrate.execFileCommand({ program: 'git', args: ['status'], cwd: '/home/me/repo' }).program).toBe('wsl.exe');
  });
});
