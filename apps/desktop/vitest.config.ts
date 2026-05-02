import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@electron': path.resolve(__dirname, 'electron'),
      '@plugins': path.resolve(__dirname, '../../plugins'),
      '@packages': path.resolve(__dirname, '../../packages'),
    },
  },
  test: {
    setupFiles: ['test/vitest.setup.ts'],
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
