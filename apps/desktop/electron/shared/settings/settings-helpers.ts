import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { SERO_AGENT_DIR } from '../../platform/env';

/** Extract the `sero` namespace from a parsed settings object. */
export function getSeroSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const raw = settings.sero;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

/** Read and parse settings.json from the active agent directory. */
export function readSettings(): Record<string, unknown> {
  const settingsPath = path.join(SERO_AGENT_DIR, 'settings.json');
  try {
    return JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Persist the active profile's settings.json. */
export function writeSettings(settings: Record<string, unknown>): void {
  const settingsPath = path.join(SERO_AGENT_DIR, 'settings.json');
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}
