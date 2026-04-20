import type { SeroAppManifest } from '@/types/ipc';
import { classifyPluginDevConflicts } from './dev-sessions/conflicts';

/**
 * Prevent external plugins from shadowing an unrelated app id.
 * Reinstalling/upgrading the plugin already installed at `installPath` is allowed.
 */
export function assertPluginInstallAllowed(
  existingApps: SeroAppManifest[],
  pluginId: string,
  installPath: string,
): void {
  const conflicts = classifyPluginDevConflicts({
    appId: pluginId,
    sourcePath: installPath,
    existingApps,
  });

  if (conflicts.length === 0) {
    return;
  }

  throw new Error(`Cannot install plugin "${pluginId}": ${conflicts[0]!.message}`);
}
