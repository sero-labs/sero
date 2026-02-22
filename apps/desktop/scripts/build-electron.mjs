import { build } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const shared = {
  platform: 'node',
  target: 'node20',
  format: 'esm',
  bundle: true,
  sourcemap: true,
  external: ['electron', 'node-pty', '@mariozechner/*', '@sinclair/typebox', '@google/genai'],
  outdir: 'dist/electron',
  logLevel: 'info',
  // Keep import.meta.url working for ESM dependencies (pi SDK)
  banner: {
    js: `
import { createRequire as __createRequire } from 'module';
import { fileURLToPath as __fileURLToPath } from 'url';
import { dirname as __dirnameFn } from 'path';
const require = __createRequire(import.meta.url);
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirnameFn(__filename);
`.trim(),
  },
};

// Main process
await build({
  ...shared,
  entryPoints: ['electron/main.ts'],
  outExtension: { '.js': '.mjs' },
});

// Preload — must be CJS for Electron's preload context
await build({
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  bundle: true,
  sourcemap: true,
  external: ['electron'],
  outdir: 'dist/electron',
  logLevel: 'info',
  entryPoints: ['electron/preload.ts'],
});
