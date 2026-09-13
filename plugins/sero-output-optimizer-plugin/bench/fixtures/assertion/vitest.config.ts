import { defineConfig } from 'vitest/config';

/**
 * A real failing assertion for the bench harness.
 *
 * Kept out of the harness's own `bench/**\/*.test.ts` glob so it runs only when
 * the bench invokes it, never as part of the harness suite.
 */
export default defineConfig({
  root: import.meta.dirname,
  test: { include: ['failing.spec.ts'], environment: 'node' },
});
