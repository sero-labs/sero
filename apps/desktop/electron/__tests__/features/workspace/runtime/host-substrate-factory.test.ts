import { describe, expect, it } from 'vitest';
import { createHostSubstrate } from '@electron/features/workspace/runtime/backends/host/host-substrate-factory';

describe('createHostSubstrate', () => {
  it('uses WSL command rendering and /mnt/c cwd for Windows-native drive workspaces', () => {
    const substrate = createHostSubstrate('C:\\Users\\me\\repo', { platform: 'win32' });
    const rendered = substrate.execFileCommand({ program: 'git', args: ['status'], cwd: 'C:\\Users\\me\\repo' });

    expect(substrate.kind).toBe('wsl');
    expect(rendered.program).toBe('wsl.exe');
    expect(rendered.args).not.toContain('-d');
    expect(rendered.args.join(' ')).toContain('/mnt/c/Users/me/repo');
  });

  it('uses WSL substrate file primitives for WSL UNC workspaces', () => {
    const substrate = createHostSubstrate('\\\\wsl$\\Ubuntu\\home\\me\\repo', { platform: 'win32' });

    expect(substrate.kind).toBe('wsl');
    expect(substrate.execFileCommand({ program: 'git', args: ['status'], cwd: '/home/me/repo' }).program).toBe('wsl.exe');
  });
});
