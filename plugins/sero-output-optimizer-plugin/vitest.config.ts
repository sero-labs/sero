import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['extension/__tests__/**/*.test.ts', 'shared/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
