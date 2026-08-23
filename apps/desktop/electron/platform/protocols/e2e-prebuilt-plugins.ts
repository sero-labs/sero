/**
 * Test-only plugin resolution for the e2e suites.
 *
 * With SERO_E2E_PREBUILT_PLUGINS=1 a plugin that has a `dist/plugin`
 * build loads from it instead of source, so specs exercise the same
 * artefact the packaged app ships. Plugins with no build load from
 * source, because the e2e workflow builds only the plugins it drives.
 *
 * A build older than its source throws. Serving a stale build against
 * edited source makes the run prove nothing about the edit.
 */

import { readdirSync, statSync } from 'fs';
import path from 'path';
import { isBuiltinPackageDir } from './builtin-package-detection.js';

const SKIPPED_DIRS = new Set(['dist', 'node_modules', '.git', '.turbo']);

/** Newest mtime under `dir`, ignoring build output and dependencies. */
function newestSourceMtime(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIPPED_DIRS.has(entry.name)) continue;
    const entryPath = path.join(dir, entry.name);
    const mtime = entry.isDirectory()
      ? newestSourceMtime(entryPath)
      : statSync(entryPath).mtimeMs;
    if (mtime > newest) newest = mtime;
  }
  return newest;
}

export function resolvePrebuiltPluginPath(pluginPath: string): string {
  const builtPath = path.join(pluginPath, 'dist', 'plugin');
  const rebuild = `node scripts/build-plugin.mjs ${path.basename(pluginPath)}`;

  if (!isBuiltinPackageDir(builtPath)) return pluginPath;

  const builtManifest = path.join(builtPath, 'package.json');
  const builtAt = statSync(builtManifest).mtimeMs;
  const sourceAt = newestSourceMtime(pluginPath);
  if (sourceAt > builtAt) {
    throw new Error(
      `SERO_E2E_PREBUILT_PLUGINS=1 but the build of ${pluginPath} is older than its source. Run: ${rebuild}`,
    );
  }

  return builtPath;
}
