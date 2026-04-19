import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'extension/__tests__/**/*.test.ts',
      'runtime/**/*.test.ts',
      'shared/__tests__/**/*.test.ts',
      'ui/**/*.test.tsx',
    ],
    environment: 'node',
  },
});
