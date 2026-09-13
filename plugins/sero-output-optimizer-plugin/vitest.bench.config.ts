import { defineConfig } from 'vitest/config';

/**
 * The bench harness runs real tools, so it is separate from the unit suite.
 * Run it with `pnpm --filter @sero-ai/plugin-output-optimizer bench`.
 */
export default defineConfig({
  test: {
    include: ['bench/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30 * 60 * 1000,
    hookTimeout: 30 * 60 * 1000,
  },
});
