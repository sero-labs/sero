/**
 * Resolving a built-in plugin's runtime dependencies to a flat, copyable set.
 *
 * pnpm does not put a package's own dependencies inside it. `@ff-labs/fff-node`
 * lives at `.pnpm/@ff-labs+fff-node@x/node_modules/@ff-labs/fff-node`, and its
 * `ffi-rs` and platform binary packages sit beside it, one level up. Copying
 * only the directory the plugin's `node_modules` points at therefore stages a
 * package that cannot resolve its own requires — which for a native dependency
 * means the packaged app fails at the first call, not at build time.
 *
 * So a dependency that resolves into the pnpm virtual store is staged together
 * with the peers in its store directory, producing the flat layout Node's
 * resolver expects. A dependency that is already a plain directory (an npm
 * install, or a release checkout) is staged as-is.
 */

import fs from 'fs';
import path from 'path';

/** The `node_modules` directory that directly contains `packageDir`. */
function containingNodeModules(packageDir, dependencyName) {
  const depth = dependencyName.startsWith('@') ? 2 : 1;
  let current = packageDir;
  for (let step = 0; step < depth; step += 1) current = path.dirname(current);
  return path.basename(current) === 'node_modules' ? current : null;
}

function isVirtualStoreDir(nodeModulesDir) {
  return path.basename(path.dirname(nodeModulesDir)).length > 0
    && path.basename(path.dirname(path.dirname(nodeModulesDir))) === '.pnpm';
}

/** Every package directory inside a `node_modules`, with scopes expanded. */
function listPackages(nodeModulesDir) {
  const entries = [];
  for (const entry of fs.readdirSync(nodeModulesDir)) {
    if (entry.startsWith('.')) continue;
    const entryPath = path.join(nodeModulesDir, entry);
    if (!entry.startsWith('@')) {
      entries.push({ name: entry, source: entryPath });
      continue;
    }
    for (const scoped of fs.readdirSync(entryPath)) {
      entries.push({ name: `${entry}/${scoped}`, source: path.join(entryPath, scoped) });
    }
  }
  return entries;
}

/**
 * Resolves one declared dependency to the package directories that must be
 * staged for it to run. Returns `[]` when the dependency is not installed —
 * an optional platform binary for another architecture, for instance.
 *
 * Expansion is transitive: `@ff-labs/fff-node` needs `ffi-rs`, and `ffi-rs`
 * needs its own platform binary package, which sits in a different store
 * directory again.
 */
export function resolveDependencyStagingEntries(pluginNodeModules, dependencyName) {
  const linkPath = path.join(pluginNodeModules, dependencyName);
  if (!fs.existsSync(linkPath)) return [];

  const real = fs.realpathSync(linkPath);
  const nodeModulesDir = containingNodeModules(real, dependencyName);
  if (!nodeModulesDir || !isVirtualStoreDir(nodeModulesDir)) {
    return [{ name: dependencyName, source: linkPath }];
  }

  // A package appears in both its own store directory and in the store of
  // everything that depends on it, so entries are keyed by name.
  const entries = new Map();
  const visitedStores = new Set();
  const queue = [nodeModulesDir];
  while (queue.length > 0) {
    const store = queue.shift();
    if (visitedStores.has(store)) continue;
    visitedStores.add(store);

    for (const { name, source } of listPackages(store)) {
      const resolved = fs.realpathSync(source);
      if (!entries.has(name)) entries.set(name, { name, source: resolved });
      const peerStore = containingNodeModules(resolved, name);
      if (peerStore && isVirtualStoreDir(peerStore)) queue.push(peerStore);
    }
  }
  return [...entries.values()];
}

/**
 * Resolves every declared dependency, de-duplicated by package name. The first
 * resolution of a name wins, which keeps a directly declared dependency ahead
 * of the same package pulled in as somebody else's peer.
 */
export function resolvePluginStagingEntries(pluginNodeModules, dependencyNames) {
  const byName = new Map();
  for (const dependencyName of dependencyNames) {
    for (const entry of resolveDependencyStagingEntries(pluginNodeModules, dependencyName)) {
      if (!byName.has(entry.name)) byName.set(entry.name, entry);
    }
  }
  return [...byName.values()];
}
