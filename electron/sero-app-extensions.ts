/**
 * Loads Pi extension factories from discovered Sero apps.
 *
 * Each Sero app's package.json declares `pi.extensions` — standard
 * Pi extension entry points. This module resolves them and returns
 * extension factory functions for injection into agent sessions.
 */

import path from 'path';
import { promises as fs } from 'fs';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

type ExtensionFactory = (pi: ExtensionAPI) => void;

interface PkgJson {
  pi?: { extensions?: string[] };
}

/**
 * Get extension factory functions for all discovered Sero apps.
 *
 * Reads each package's `pi.extensions` paths, resolves them to absolute
 * paths, then dynamically requires each one. The default export of each
 * extension file is a factory function `(pi: ExtensionAPI) => void`.
 *
 * @param packageDirs - Absolute paths to Sero app package directories
 */
export async function loadSeroAppExtensions(
  packageDirs: string[],
): Promise<ExtensionFactory[]> {
  const factories: ExtensionFactory[] = [];

  for (const dir of packageDirs) {
    const extPaths = await readExtensionPaths(dir);
    for (const extPath of extPaths) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require(extPath);
        const factory: ExtensionFactory = mod.default ?? mod;
        if (typeof factory === 'function') {
          factories.push(factory);
        } else {
          console.warn(`[sero-app-ext] ${extPath} does not export a function`);
        }
      } catch (err) {
        console.error(`[sero-app-ext] Failed to load ${extPath}:`, err);
      }
    }
  }

  return factories;
}

async function readExtensionPaths(packageDir: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(path.join(packageDir, 'package.json'), 'utf8');
    const pkg: PkgJson = JSON.parse(raw);
    if (!pkg.pi?.extensions?.length) return [];
    return pkg.pi.extensions.map((ext) => path.resolve(packageDir, ext));
  } catch {
    return [];
  }
}
