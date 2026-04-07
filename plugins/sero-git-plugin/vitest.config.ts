import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'extension/__tests__/**/*.test.ts',
      'shared/__tests__/**/*.test.ts',
      'ui/lib/**/*.test.ts',
    ],
    environment: 'node',
  },
});
