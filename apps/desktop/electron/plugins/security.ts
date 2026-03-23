import path from 'path';

const VALID_PLUGIN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Validate a plugin id against Sero's safe kebab-case app id format. */
export function assertValidPluginId(pluginId: string): string {
  const trimmed = pluginId.trim();
  if (!VALID_PLUGIN_ID.test(trimmed)) {
    throw new Error(
      `Invalid plugin id: ${pluginId}. Expected lowercase kebab-case (letters, numbers, hyphens).`,
    );
  }
  return trimmed;
}

/** Ensure a resolved path stays inside the expected parent directory. */
export function ensurePathInsideDir(parentDir: string, targetPath: string): string {
  const resolvedParent = path.resolve(parentDir);
  const resolvedTarget = path.resolve(targetPath);

  if (!resolvedTarget.startsWith(`${resolvedParent}${path.sep}`)) {
    throw new Error(
      resolvedTarget === resolvedParent
        ? `Resolved plugin path is the plugins directory itself (missing id?): ${resolvedTarget}`
        : `Resolved plugin path escapes the plugins directory: ${resolvedTarget}`,
    );
  }

  return resolvedTarget;
}

/** Resolve a plugin's install directory under ~/.sero-ui/agent/packages safely. */
export function resolvePluginInstallDir(pluginsDir: string, pluginId: string): string {
  const safePluginId = assertValidPluginId(pluginId);
  return ensurePathInsideDir(pluginsDir, path.join(pluginsDir, safePluginId));
}
