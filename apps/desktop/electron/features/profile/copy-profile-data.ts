/**
 * Helpers for copying transferable profile data into a newly created profile.
 *
 * This is used by the "Copy credentials and model preferences from current
 * profile" option in the profile creation flow.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import path from 'path';

import { getGlobalModelConfigTiers, setGlobalModelConfig } from '../../shared/settings/model-config';

export const TRANSFERABLE_PROFILE_AGENT_FILES = [
  'auth.json',
  'github-auth.json',
  'google-auth.json',
  'gateway-config.json',
  'gateway-token',
  'gateway-web-tokens.json',
  'provider-model-defaults.json',
] as const;

function getAgentFilePath(profilePath: string, fileName: string): string {
  return path.join(profilePath, 'agent', fileName);
}

function hasMeaningfulFileContent(filePath: string): boolean {
  try {
    const content = readFileSync(filePath, 'utf8').trim();
    return content.length > 0 && content !== '{}' && content !== '[]';
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
    copyFilePreservingMode(sourcePath, path.join(destAgentDir, fileName));
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
    return existsSync(filePath) && hasMeaningfulFileContent(filePath);
  });
}

/** Copy credentials, gateway auth, and model preferences into a new profile. */
export function copyProfileDataSync(
  sourceProfilePath: string,
  destProfilePath: string,
): void {
  copyTransferableAgentFiles(sourceProfilePath, destProfilePath);
  copyGlobalModelPreferences(sourceProfilePath, destProfilePath);
}
