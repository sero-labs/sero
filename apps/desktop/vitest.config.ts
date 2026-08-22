import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@assets': path.resolve(__dirname, '../../assets'),
      '@electron': path.resolve(__dirname, 'electron'),
      '@plugins': path.resolve(__dirname, '../../plugins'),
      '@packages': path.resolve(__dirname, '../../packages'),
    },
  },
  test: {
    setupFiles: ['test/vitest.setup.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'electron/__tests__/**/*.test.ts',
            'e2e/helpers/__tests__/**/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        },
      },
    ],
  },
});
