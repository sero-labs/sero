import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'runtime/**/*.test.ts', 'extension/**/*.test.ts'],
    environment: 'node',
  },
});
