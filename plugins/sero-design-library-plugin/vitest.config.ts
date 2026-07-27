import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `ui/lib` holds pure helpers with no DOM dependency, so they run under the
    // same node environment as everything else.
    include: ['shared/**/*.test.ts', 'runtime/**/*.test.ts', 'extension/**/*.test.ts', 'ui/lib/**/*.test.ts'],
    environment: 'node',
  },
});
