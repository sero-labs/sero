import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@electron': fileURLToPath(new URL('./electron', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    root: fileURLToPath(new URL('../../eval', import.meta.url)),
    environment: 'node',
    include: ['*.test.ts'],
  },
});
