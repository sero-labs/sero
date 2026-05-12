import { describe, expect, it } from 'vitest';
import { createHostSubstrate } from '@electron/features/workspace/runtime/backends/host/host-substrate-factory';

describe('createHostSubstrate', () => {
  it('returns a posix substrate on macOS', () => {
    const substrate = createHostSubstrate('/Users/me/repo', { platform: 'darwin' });
    expect(substrate.kind).toBe('posix');
  });

  it('returns a posix substrate on Linux', () => {
    const substrate = createHostSubstrate('/home/me/repo', { platform: 'linux' });
    expect(substrate.kind).toBe('posix');
  });

  it('throws on Windows because host runtime is not supported there', () => {
    expect(() => createHostSubstrate('C:\\Users\\me\\repo', { platform: 'win32' }))
      .toThrow(/Host runtime is not supported on Windows/);
  });
});
