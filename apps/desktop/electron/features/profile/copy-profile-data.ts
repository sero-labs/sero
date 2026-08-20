/**
 * Helpers for copying transferable profile data into a newly created profile.
 *
 * This is used by the "Copy credentials and model preferences from current
 * profile" option in the profile creation flow.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import path from 'path';

import { getGlobalModelConfigTiers, setGlobalModelConfig } from '@electron/shared/settings/model-config';

const TRANSFERABLE_PROFILE_AGENT_FILES = [
  '.env',
  'auth.json',
  'github-auth.json',
  'plugin-config/sero-google-plugin.json',
  'gateway-config.json',
  'gateway-token',
  'gateway-web-tokens.json',
  'models.json',
  'provider-model-defaults.json',
] as const;

type TransferableProfileAgentFile = typeof TRANSFERABLE_PROFILE_AGENT_FILES[number];

function getAgentFilePath(profilePath: string, relativePath: string): string {
  return path.join(profilePath, 'agent', relativePath);
}

function hasMeaningfulTextContent(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.length > 0 && trimmed !== '{}' && trimmed !== '[]';
}

function hasMeaningfulEnvContent(content: string): boolean {
  return content
    .split('\n')
    .map((line) => line.trim())
    .some((line) => line.length > 0 && !line.startsWith('#') && line.includes('='));
}

function hasMeaningfulModelsConfigContent(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as { providers?: unknown };
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const providers = parsed.providers;
      if (providers && typeof providers === 'object' && !Array.isArray(providers)) {
        return Object.keys(providers as Record<string, unknown>).length > 0;
      }
    }
  } catch {
    // Fall back to generic non-empty checks below.
  }

  return hasMeaningfulTextContent(content);
}

function hasMeaningfulFileContent(
  filePath: string,
  fileName: TransferableProfileAgentFile,
): boolean {
  try {
    const content = readFileSync(filePath, 'utf8');
    if (fileName === '.env') return hasMeaningfulEnvContent(content);
    if (fileName === 'models.json') return hasMeaningfulModelsConfigContent(content);
    return hasMeaningfulTextContent(content);
  } catch {
    return false;
  }
}

function copyFilePreservingMode(sourcePath: string, destPath: string): void {
  const data = readFileSync(sourcePath);
  const mode = statSync(sourcePath).mode;
  writeFileSync(destPath, data, { mode });
}

function copyTransferableAgentFiles(
  sourceProfilePath: string,
  destProfilePath: string,
): void {
  const destAgentDir = path.join(destProfilePath, 'agent');
  mkdirSync(destAgentDir, { recursive: true });

  for (const fileName of TRANSFERABLE_PROFILE_AGENT_FILES) {
    const sourcePath = getAgentFilePath(sourceProfilePath, fileName);
    if (!existsSync(sourcePath)) continue;
    const destPath = getAgentFilePath(destProfilePath, fileName);
    mkdirSync(path.dirname(destPath), { recursive: true });
    copyFilePreservingMode(sourcePath, destPath);
  }
}

/**
 * Carry an app's declared preference keys into the new profile.
 *
 * Apps hold preferences the checkbox already promises to copy — which model to
 * use, what limits it runs under — in their own state file, which lives outside
 * `agent/` and so was never covered here.
 *
 * Only the keys an app declares in `sero.app.portableState` travel, and they
 * are merged into the destination rather than replacing it. Copying a whole
 * state file would carry that profile's workspace list, build history, and
 * `lastBuiltAt` stamps into a profile where those workspaces do not exist —
 * which, for an app that indexes workspaces, means queueing paid work on
 * arrival.
 */
function copyPortableAppState(
  sourceProfilePath: string,
  destProfilePath: string,
  apps: PortableApp[],
): void {
  for (const app of apps) {
    if (app.portableState.length === 0) continue;
    const sourcePath = path.join(sourceProfilePath, 'apps', app.id, 'state.json');
    if (!existsSync(sourcePath)) continue;

    let source: Record<string, unknown>;
    try {
      source = JSON.parse(readFileSync(sourcePath, 'utf8')) as Record<string, unknown>;
    } catch {
      continue;
    }

    const portable: Record<string, unknown> = {};
    for (const key of app.portableState) {
      if (source[key] !== undefined) portable[key] = source[key];
    }
    if (Object.keys(portable).length === 0) continue;

    const destPath = path.join(destProfilePath, 'apps', app.id, 'state.json');
    let dest: Record<string, unknown> = {};
    try {
      dest = JSON.parse(readFileSync(destPath, 'utf8')) as Record<string, unknown>;
    } catch {
      // Fresh profile — the app writes the rest of its state on first run.
    }
    mkdirSync(path.dirname(destPath), { recursive: true });
    writeFileSync(destPath, JSON.stringify({ ...dest, ...portable }, null, 2) + '\n', 'utf8');
  }
}

function copyGlobalModelPreferences(
  sourceProfilePath: string,
  destProfilePath: string,
): void {
  const sourceSettingsPath = getAgentFilePath(sourceProfilePath, 'settings.json');
  if (!existsSync(sourceSettingsPath)) return;

  try {
    const sourceSettings = JSON.parse(readFileSync(sourceSettingsPath, 'utf8')) as Record<string, unknown>;
    const sourceTiers = getGlobalModelConfigTiers(sourceSettings);
    const sourceDefaultThinkingLevel = typeof sourceSettings.defaultThinkingLevel === 'string'
      ? sourceSettings.defaultThinkingLevel
      : undefined;
    const destSettingsPath = getAgentFilePath(destProfilePath, 'settings.json');

    let destSettings: Record<string, unknown> = {};
    try {
      destSettings = JSON.parse(readFileSync(destSettingsPath, 'utf8')) as Record<string, unknown>;
    } catch {
      // Fresh profile — start from an empty settings object.
    }

    const updated = setGlobalModelConfig(destSettings, {
      tiers: sourceTiers,
    });
    if (Object.keys(sourceTiers).length === 0 && sourceDefaultThinkingLevel) {
      updated.defaultThinkingLevel = sourceDefaultThinkingLevel;
    }
    mkdirSync(path.dirname(destSettingsPath), { recursive: true });
    writeFileSync(destSettingsPath, JSON.stringify(updated, null, 2) + '\n', 'utf8');
  } catch {
    // Non-critical — model preferences can be configured later.
  }
}

/** Check whether a profile has transferable credentials/config to copy. */
export function profileHasTransferableData(profilePath: string): boolean {
  return TRANSFERABLE_PROFILE_AGENT_FILES.some((fileName) => {
    const filePath = getAgentFilePath(profilePath, fileName);
    return existsSync(filePath) && hasMeaningfulFileContent(filePath, fileName);
  });
}

/** An app that declares state keys safe to carry between profiles. */
export interface PortableApp {
  id: string;
  portableState: string[];
}

/** Copy credentials, gateway auth, local model config, and model preferences into a new profile. */
export function copyProfileDataSync(
  sourceProfilePath: string,
  destProfilePath: string,
  portableApps: PortableApp[] = [],
): void {
  copyTransferableAgentFiles(sourceProfilePath, destProfilePath);
  copyGlobalModelPreferences(sourceProfilePath, destProfilePath);
  copyPortableAppState(sourceProfilePath, destProfilePath, portableApps);
}
