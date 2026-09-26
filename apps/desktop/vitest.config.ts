import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
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
    // CI runs one package at a time (`turbo run test --concurrency=1`), so the
    // suite can use most of the runner. A local run puts three packages on the
    // same machine, so each suite stays near a third of the available CPUs.
    maxWorkers: process.env.CI ? '75%' : '33%',
    setupFiles: ['test/vitest.setup.ts'],
    // `test:packaging` runs with `--mode packaging` so the packaging checks fail
    // when the staged plugins are missing. The mode replaces an inline
    // `VAR=1 vitest` prefix, which cmd.exe cannot run on Windows.
    env: mode === 'packaging' ? { SERO_REQUIRE_PACKAGED_PLUGINS: '1' } : {},
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
}));
