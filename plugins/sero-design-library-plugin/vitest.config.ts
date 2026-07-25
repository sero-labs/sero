import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'tests/**/*.test.ts', 'ui/**/*.test.ts', 'ui/**/*.test.tsx'],
    environment: 'node',
  },
});
