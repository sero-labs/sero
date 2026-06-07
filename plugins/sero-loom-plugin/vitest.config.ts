import { defineConfig } from 'vitest/config';

// Standalone vitest config so tests do NOT load vite.config.ts (the Module
// Federation / Tailwind plugins are irrelevant to the node-side unit tests).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['{shared,extension,ui}/**/*.test.ts'],
  },
});
