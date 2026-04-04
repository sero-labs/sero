/**
 * Generic plugin config storage.
 *
 * Any plugin can store/retrieve JSON config via this module.
 * Config files are stored at `~/.sero-ui/agent/plugin-config/<pluginId>.json`
 * with 0o600 permissions to protect sensitive values (API keys, secrets).
 *
 * Used by both the IPC layer (for renderer access) and host-side code
 * (e.g. auth-manager reading Google OAuth credentials).
 */

import { readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { SERO_AGENT_DIR } from '../platform/env';

const PLUGIN_CONFIG_DIR = path.join(SERO_AGENT_DIR, 'plugin-config');

function configPath(pluginId: string): string {
  // Sanitize pluginId to prevent path traversal
  const safe = pluginId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(PLUGIN_CONFIG_DIR, `${safe}.json`);
}

/** Read a plugin's config. Returns null if missing or malformed. */
export function readPluginConfig(pluginId: string): Record<string, unknown> | null {
  try {
    const raw = readFileSync(configPath(pluginId), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/** Write a plugin's config. Creates directory if needed. Enforces 0o600 permissions. */
export function writePluginConfig(pluginId: string, config: Record<string, unknown>): void {
  mkdirSync(PLUGIN_CONFIG_DIR, { recursive: true, mode: 0o700 });
  const p = configPath(pluginId);
  writeFileSync(p, JSON.stringify(config, null, 2) + '\n', 'utf8');
  chmodSync(p, 0o600);
}
