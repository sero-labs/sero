/**
 * The built-in FFF search plugin, as the host sees it.
 *
 * `plugins/sero-fff-plugin` registers `find`, `grep`, and `multi_grep`. A chat
 * and its subagents load every discovered package, so those sessions get the
 * tools for free. Two surfaces do not:
 *
 *   - a read-only subagent, whose tool allowlist is built from platform tools
 *     alone (see `sessionToolOptions`);
 *   - a managed persistent session, which loads only the packages of the app
 *     that holds its grant (see the member resource profile).
 *
 * Both are read-only surfaces where ranked search is exactly the capability the
 * approval already describes, so the names and the package path are resolved
 * here rather than hard-coded at each call site. Nothing in this module is an
 * FFF-specific host capability: it is a package path and three tool names.
 */

import path from 'path';

import type { LoadExtensionsResult } from '@earendil-works/pi-coding-agent';

import { discoverBuiltinPluginPaths } from '@electron/platform/protocols/builtin-resources';

/** Directory name of the bundled plugin, in both source and packaged layouts. */
const SEARCH_PLUGIN_DIR = 'sero-fff-plugin';

/**
 * Read-only search tools contributed by the plugin.
 *
 * Kept in sync with the tool names the plugin registers; a name that no longer
 * exists is simply never matched, and the SDK ignores an unknown allowlist entry.
 */
export const SEARCH_TOOL_NAMES = ['find', 'grep', 'multi_grep'] as const;

/**
 * Absolute path of the bundled search plugin, or `null` when this build does
 * not ship it. Derived from the host's own bundled-plugin discovery, never from
 * a manifest, so a third-party package cannot claim to be it.
 */
export function resolveSearchPluginPackagePath(): string | null {
  return discoverBuiltinPluginPaths()
    .find((pluginPath) => path.basename(pluginPath) === SEARCH_PLUGIN_DIR) ?? null;
}

/** The search plugin's package path as a list, for splicing into a `packages` array. */
export function searchPluginPackages(): string[] {
  const packagePath = resolveSearchPluginPackagePath();
  return packagePath ? [packagePath] : [];
}

function isInsidePackage(packagePath: string, resourcePath: string): boolean {
  const relative = path.relative(path.resolve(packagePath), path.resolve(resourcePath));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/** Removes conventional search names registered outside the built-in package. */
export function restrictSearchToolOrigins(base: LoadExtensionsResult): LoadExtensionsResult {
  const packagePath = resolveSearchPluginPackagePath();
  const searchNames = new Set<string>(SEARCH_TOOL_NAMES);

  return {
    ...base,
    extensions: base.extensions.map((extension) => {
      if (packagePath && isInsidePackage(packagePath, extension.resolvedPath)) return extension;
      const tools = new Map(extension.tools);
      let changed = false;
      for (const name of searchNames) changed = tools.delete(name) || changed;
      return changed ? { ...extension, tools } : extension;
    }),
  };
}
