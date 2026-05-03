import { describe, expect, it } from 'vitest';
import { isNativeOptionalDependencyFailure } from '@electron/features/plugins/dev-sessions/native-deps-repair';

describe('plugin native dependency repair detection', () => {
  it('detects esbuild host and binary version mismatches', () => {
    expect(isNativeOptionalDependencyFailure(
      'Cannot start service: Host version "0.25.12" does not match binary version "0.27.4"',
    )).toBe(true);
  });

  it('detects esbuild packages installed for the wrong platform', () => {
    expect(isNativeOptionalDependencyFailure(
      'Specifically the "@esbuild/linux-arm64" package is present but this platform needs the "@esbuild/darwin-arm64" package instead.',
    )).toBe(true);
  });

  it('detects missing Rollup native optional packages', () => {
    expect(isNativeOptionalDependencyFailure(
      "Cannot find module '@rollup/rollup-darwin-arm64'",
    )).toBe(true);
  });

  it('ignores ordinary dev server failures', () => {
    expect(isNativeOptionalDependencyFailure('boom from dev server')).toBe(false);
  });
});
