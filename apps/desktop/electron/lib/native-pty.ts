/**
 * Typed wrapper for loading node-pty at runtime.
 *
 * node-pty is a native C++ addon (.node binary) that can only be loaded
 * via CommonJS require() — it does not support ESM import. Since the
 * electron main process is bundled as ESM by esbuild, we use the require()
 * polyfill that esbuild injects via the banner in build-electron.mjs.
 *
 * The esbuild config lists node-pty as `external`, so it stays as a bare
 * require() in the output and resolves from node_modules at runtime.
 *
 * This module provides a lazy-loaded, properly typed accessor so callers
 * can just `import { pty } from './lib/native-pty'` instead of repeating
 * the require-cast pattern.
 */

import type { IPty } from 'node-pty';

interface NodePty {
  spawn: (
    file: string,
    args: string[],
    options: {
      name?: string;
      cols?: number;
      rows?: number;
      cwd?: string;
      env?: Record<string, string>;
    },
  ) => IPty;
}

let cached: NodePty | undefined;

/** Load node-pty (native addon, lazy + cached). */
export function loadNodePty(): NodePty {
  if (!cached) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require('node-pty') as NodePty;
  }
  return cached;
}
