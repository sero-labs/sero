/**
 * The runtime bundles and loads.
 *
 * This exists because it did not, and nothing else noticed. A CommonJS
 * dependency (`pngjs`) was added to the runtime; the host bundles this entry as
 * a single ESM file, where its `require("util")` throws at load time. The
 * runtime then failed to start, which means **no request in the whole plugin is
 * ever applied** — every button in Design Library and Sprite Studio went
 * quietly dead, and the only evidence was one line in the desktop log.
 *
 * Unit tests could not see it: vitest loads CommonJS happily. A typecheck could
 * not see it. The plugin's own `vite build` could not see it, because that
 * builds the *page*, not the runtime. So the check has to be this one — bundle
 * the way the host bundles, then import the result.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';
import { afterAll, expect, it } from 'vitest';

/**
 * What the host keeps out of the bundle.
 *
 * The Pi SDK is provided by the host at runtime, and `esbuild` is declared in
 * `sero.app.runtimeExternals`. Everything else must survive being inlined into
 * one ESM file — which is the whole point of the check.
 */
const EXTERNAL = [
  'esbuild',
  '@earendil-works/pi-ai',
  '@earendil-works/pi-coding-agent',
  '@earendil-works/pi-agent-core',
  '@sero-ai/common',
];

let directory: string | null = null;

afterAll(async () => {
  if (directory !== null) await rm(directory, { recursive: true, force: true });
});

it('bundles as ESM and imports without a dynamic require', { timeout: 120_000 }, async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'sero-runtime-load-'));
  const outfile = path.join(directory, 'runtime.mjs');

  await build({
    entryPoints: [path.join(import.meta.dirname, 'index.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    external: EXTERNAL,
    logLevel: 'silent',
  });

  // The import is the test. A CommonJS package inlined into an ESM bundle
  // throws here — `Dynamic require of "util" is not supported` — exactly as it
  // did in the app.
  const module = (await import(pathToFileURL(outfile).href)) as {
    default?: { createAppRuntime?: unknown };
  };
  expect(typeof module.default?.createAppRuntime).toBe('function');
});
