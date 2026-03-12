import { build } from 'esbuild';
import fs from 'fs';
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
  external: ['electron', 'node-pty', '@mariozechner/*', '@sinclair/typebox', '@google/genai', 'ws', 'discord.js'],
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

// Copy non-JS assets that the main process reads at runtime
fs.copyFileSync(
  path.join(projectRoot, 'electron/container/browser-helper.py'),
  path.join(projectRoot, 'dist/electron/browser-helper.py'),
);

// Copy web-remote SPA (if built) so the gateway can serve it at runtime.
// The gateway's static file server resolves web-dist/ relative to __dirname
// which, after esbuild bundling, is dist/electron/.
const webDistSrc = path.join(projectRoot, 'electron/gateway/web-dist');
const webDistDest = path.join(projectRoot, 'dist/electron/web-dist');
if (fs.existsSync(webDistSrc)) {
  fs.cpSync(webDistSrc, webDistDest, { recursive: true });
  console.log('  Copied web-dist/ to dist/electron/web-dist/');
}

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
