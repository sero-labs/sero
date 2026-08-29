export interface PluginStagingEntry {
  /** Package name as it must appear under the staged `node_modules`. */
  readonly name: string;
  /** Directory to copy from. */
  readonly source: string;
  /** Path below the staged `node_modules`. */
  readonly destination: string;
}

export function resolveDependencyStagingEntries(
  pluginNodeModules: string,
  dependencyName: string,
): PluginStagingEntry[];

export function resolvePluginStagingEntries(
  pluginNodeModules: string,
  dependencyNames: readonly string[],
): PluginStagingEntry[];
