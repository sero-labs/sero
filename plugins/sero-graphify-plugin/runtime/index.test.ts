import { describe, expect, it } from 'vitest';
import { compareVersions } from './index';

describe('compareVersions', () => {
  it('offers only a strictly newer release', () => {
    // A yanked release can leave PyPI reporting a lower version. "Updating" to
    // it would downgrade the extractor and invalidate the cache, re-billing
    // every workspace to go backwards.
    expect(compareVersions('0.9.48', '0.9.47')).toBeGreaterThan(0);
    expect(compareVersions('0.9.46', '0.9.47')).toBeLessThan(0);
    expect(compareVersions('0.9.47', '0.9.47')).toBe(0);
  });

  it('compares numerically, not as text', () => {
    expect(compareVersions('0.10.0', '0.9.47')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0);
  });
});
