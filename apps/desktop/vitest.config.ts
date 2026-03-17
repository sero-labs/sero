import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: [
      'electron/__tests__/**/*.test.ts',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
    ],
    environment: 'node',
    environmentMatchGlobs: [
      ['src/**/*.test.ts', 'jsdom'],
      ['src/**/*.test.tsx', 'jsdom'],
    ],
  },
});
