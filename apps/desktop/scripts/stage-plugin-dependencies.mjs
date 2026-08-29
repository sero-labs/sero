/**
 * Resolving a built-in plugin's runtime dependencies to a copyable tree.
 *
 * pnpm does not put a package's own dependencies inside it. `@ff-labs/fff-node`
 * lives at `.pnpm/@ff-labs+fff-node@x/node_modules/@ff-labs/fff-node`, and its
 * `ffi-rs` and platform binary packages sit beside it, one level up. Copying
 * only the directory the plugin's `node_modules` points at therefore stages a
 * package that cannot resolve its own requires — which for a native dependency
 * means the packaged app fails at the first call, not at build time.
 *
 * The staging tree follows each package's installed runtime dependencies and
 * nests them below that package. This preserves pnpm's resolved versions while
 * producing a normal directory tree that Node can load after packaging.
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

function runtimeDependencyNames(packageDir) {
  const manifestPath = path.join(packageDir, 'package.json');
  if (!fs.existsSync(manifestPath)) return [];
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return [...new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ])];
}

function resolveInstalledDependency(packageDir, packageName, dependencyName) {
  const containing = containingNodeModules(packageDir, packageName);
  const candidates = [
    path.join(packageDir, 'node_modules', dependencyName),
    containing ? path.join(containing, dependencyName) : null,
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) ?? null;
}

/**
 * Resolves one declared dependency to the package directories that must be
 * staged for it to run. Returns `[]` when the dependency is not installed —
 * an optional platform binary for another architecture, for instance.
 *
 * Expansion is transitive. Each dependency is placed below the package that
 * resolved it, so two packages can retain different versions of one name.
 */
export function resolveDependencyStagingEntries(pluginNodeModules, dependencyName) {
  const linkPath = path.join(pluginNodeModules, dependencyName);
  if (!fs.existsSync(linkPath)) return [];

  const rootSource = fs.realpathSync(linkPath);
  const entries = [];
  const visitedDestinations = new Set();
  const queue = [{
    name: dependencyName,
    source: rootSource,
    destination: dependencyName,
    ancestors: new Set([rootSource]),
  }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (visitedDestinations.has(current.destination)) continue;
    visitedDestinations.add(current.destination);
    entries.push({
      name: current.name,
      source: current.source,
      destination: current.destination,
    });

    for (const childName of runtimeDependencyNames(current.source)) {
      const installed = resolveInstalledDependency(current.source, current.name, childName);
      if (!installed) continue;
      const childSource = fs.realpathSync(installed);
      if (current.ancestors.has(childSource)) continue;
      queue.push({
        name: childName,
        source: childSource,
        destination: path.join(current.destination, 'node_modules', childName),
        ancestors: new Set([...current.ancestors, childSource]),
      });
    }
  }
  return entries;
}

/**
 * Resolves every declared dependency. Destinations, not package names, are
 * de-duplicated because different parents may require different versions.
 */
export function resolvePluginStagingEntries(pluginNodeModules, dependencyNames) {
  const byDestination = new Map();
  for (const dependencyName of dependencyNames) {
    for (const entry of resolveDependencyStagingEntries(pluginNodeModules, dependencyName)) {
      if (!byDestination.has(entry.destination)) {
        byDestination.set(entry.destination, entry);
      }
    }
  }
  return [...byDestination.values()];
}
