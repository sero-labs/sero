import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    // `ui/lib` holds pure helpers with no DOM dependency, so they run under the
    // same node environment as everything else.
    include: [
      'shared/**/*.test.ts',
      'runtime/**/*.test.ts',
      'extension/**/*.test.ts',
      'ui/lib/**/*.test.ts',
      'ui/**/*.test.tsx',
      // Sprite Studio keeps all of its code — engine, runtime and page — in one
      // folder, so that it can be lifted into its own plugin later (D6).
      'sprite-studio/**/*.test.ts',
      'sprite-studio/**/*.test.tsx',
    ],
    // Node by default; a component test opts itself into a DOM with
    // `// @vitest-environment jsdom` on its first line. Per-file rather than a
    // second project because almost everything here is node-side, and a jsdom
    // environment would cost setup on each of those for nothing.
    environment: 'node',
    setupFiles: ['./ui/test-setup.ts'],
  },
});
