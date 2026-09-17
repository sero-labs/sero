import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Root tests run three packages at once; leave CPU capacity for the others.
    maxWorkers: '33%',
    include: [
      'extension/__tests__/**/*.test.ts',
      'runtime/__tests__/**/*.test.ts',
      'shared/__tests__/**/*.test.ts',
      'ui/**/*.test.ts',
      'ui/**/*.test.tsx',
    ],
    environment: 'node',
  },
});
