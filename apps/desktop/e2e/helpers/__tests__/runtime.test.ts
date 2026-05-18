import { describe, expect, it } from 'vitest';
import { runtimeAvailableOn, runtimeSkipReason, type RuntimeBackend } from '../runtime';

describe('runtime helper', () => {
  describe('runtimeAvailableOn', () => {
    it('host is available on every supported platform', () => {
      expect(runtimeAvailableOn('host', 'darwin')).toBe(true);
      expect(runtimeAvailableOn('host', 'linux')).toBe(true);
      expect(runtimeAvailableOn('host', 'win32')).toBe(true);
    });

    it('apple-container is darwin-only', () => {
      expect(runtimeAvailableOn('apple-container', 'darwin')).toBe(true);
      expect(runtimeAvailableOn('apple-container', 'linux')).toBe(false);
      expect(runtimeAvailableOn('apple-container', 'win32')).toBe(false);
    });

    it('docker is linux-first (macOS/Windows are manual-only in the test matrix)', () => {
      expect(runtimeAvailableOn('docker', 'linux')).toBe(true);
      expect(runtimeAvailableOn('docker', 'darwin')).toBe(false);
      expect(runtimeAvailableOn('docker', 'win32')).toBe(false);
    });
  });

  describe('runtimeSkipReason', () => {
    it('returns null when the backend is available', () => {
      expect(runtimeSkipReason('host', 'darwin')).toBeNull();
      expect(runtimeSkipReason('apple-container', 'darwin')).toBeNull();
    });

    it('returns a human-readable string when the backend is unavailable', () => {
      const reason = runtimeSkipReason('apple-container', 'linux');
      expect(reason).toMatch(/apple-container/);
      expect(reason).toMatch(/linux/);
    });
  });

  it('exports the supported backends list', async () => {
    const mod = await import('../runtime');
    expect(mod.RUNTIME_BACKENDS).toEqual<RuntimeBackend[]>([
      'host',
      'apple-container',
      'docker',
    ]);
  });
});
