import type { SeroAppManifest } from '@/types/ipc';

/**
 * Prevent external plugins from shadowing an unrelated app id.
 * Reinstalling/upgrading the plugin already installed at `installPath` is allowed.
 */
export function assertPluginInstallAllowed(
  existingApps: SeroAppManifest[],
  pluginId: string,
  installPath: string,
): void {
  const existing = existingApps.find((app) => app.id === pluginId);
  if (!existing || existing.packagePath === installPath) {
    return;
  }

  const sourceKind = existing.isPlugin ? 'another installed plugin' : 'an existing app';
  throw new Error(
    `Cannot install plugin "${pluginId}": that app id is already used by ${sourceKind} at ${existing.packagePath}.`,
  );
}
