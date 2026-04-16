import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import { invalidatePackageProviderManifestCache } from '../providers/package-provider-manifests';

export function getSettingsPath(): string {
  return path.join(SERO_AGENT_DIR, 'settings.json');
}

/** Extract the `sero` namespace from a parsed settings object. */
export function getSeroSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const raw = settings.sero;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

export type SettingsReadResult =
  | { ok: true; settings: Record<string, unknown> }
  | { ok: false; error: Error };

function buildSettingsReadError(settingsPath: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : 'unknown read error';
  return new Error(
    `Failed to read ${settingsPath}. Fix the file and retry. (${message})`,
  );
}

/** Read and parse settings.json from the active agent directory. */
export function readSettingsResult(): SettingsReadResult {
  const settingsPath = getSettingsPath();
  try {
    const raw = readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false,
        error: buildSettingsReadError(
          settingsPath,
          new Error('settings.json must contain a JSON object'),
        ),
      };
    }
    return { ok: true, settings: parsed as Record<string, unknown> };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === 'ENOENT') {
      return { ok: true, settings: {} };
    }
    return {
      ok: false,
      error: buildSettingsReadError(settingsPath, error),
    };
  }
}

/** Read settings.json, throwing if the file is malformed/unreadable. */
export function readSettings(): Record<string, unknown> {
  const result = readSettingsResult();
  if (!result.ok) {
    throw result.error;
  }
  return result.settings;
}

/** Persist the active profile's settings.json. */
export function writeSettings(settings: Record<string, unknown>): void {
  writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2) + '\n', 'utf8');
  invalidatePackageProviderManifestCache();
}
