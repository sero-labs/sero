import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every suite in the package is discovered — shared, extension, runtime and
    // UI. Rendered component tests opt into jsdom with a per-file docblock.
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules/**', 'dist/**', '.__mf__temp/**'],
    environment: 'node',
    setupFiles: ['./ui/test-setup.ts'],
  },
});
