/**
 * Build the Sero CLI into a single self-contained ESM file.
 *
 * Output: dist/sero.mjs — ready to mount into containers or run directly.
 */

import { build } from 'esbuild';
import { chmod } from 'node:fs/promises';
import path from 'node:path';

const outfile = path.resolve('dist', 'sero.mjs');

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  minify: false, // Keep readable for debugging
  banner: {
    js: '#!/usr/bin/env node\n',
  },
  external: [], // No external deps — fully self-contained
});

// Make executable
await chmod(outfile, 0o755);

console.log(`Built: ${outfile}`);
