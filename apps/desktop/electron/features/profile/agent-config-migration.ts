/**
 * Migrate legacy profile-root config files into <profile>/agent/.
 *
 * Older Sero builds stored several agent-owned config files directly under
 * SERO_HOME. We now keep them inside SERO_AGENT_DIR so the profile root stays
 * reserved for profile-level folders and files.
 *
 * This migration is intentionally synchronous so startup callers can run it
 * before constructing services that read these files.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync } from 'fs';
import path from 'path';

const LEGACY_PROFILE_ROOT_CONFIG_FILES = [
  { sourceName: 'feedback.json', targetRelativePath: 'feedback.json' },
  { sourceName: 'gateway-config.json', targetRelativePath: 'gateway-config.json' },
  { sourceName: 'gateway-token', targetRelativePath: 'gateway-token' },
  { sourceName: 'gateway-web-tokens.json', targetRelativePath: 'gateway-web-tokens.json' },
  { sourceName: 'github-auth.json', targetRelativePath: 'github-auth.json' },
  { sourceName: 'google-auth.json', targetRelativePath: 'plugin-config/sero-google-plugin.json' },
  { sourceName: 'provider-model-defaults.json', targetRelativePath: 'provider-model-defaults.json' },
] as const;

interface LegacyProfileRootConfigFile {
  sourceName: string;
  targetRelativePath: string;
}

const CONFLICT_BACKUP_DIR = 'legacy-root-configs';

type MigrationAction =
  | { type: 'moved'; sourcePath: string; targetPath: string }
  | { type: 'removed-duplicate'; sourcePath: string; targetPath: string }
  | { type: 'backed-up-conflict'; sourcePath: string; targetPath: string; backupPath: string };

function buffersEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && Buffer.compare(left, right) === 0;
}

function nextBackupPath(dir: string, fileName: string): string {
  const parsed = path.parse(fileName);
  let candidate = path.join(dir, fileName);
  let suffix = 1;

  while (existsSync(candidate)) {
    candidate = path.join(dir, `${parsed.name}.${suffix}${parsed.ext}`);
    suffix += 1;
  }

  return candidate;
}

function migrateOneFile(
  profileHome: string,
  agentDir: string,
  legacyFile: LegacyProfileRootConfigFile,
): MigrationAction | null {
  const sourcePath = path.join(profileHome, legacyFile.sourceName);
  if (!existsSync(sourcePath)) return null;

  const targetPath = path.join(agentDir, legacyFile.targetRelativePath);
  mkdirSync(path.dirname(targetPath), { recursive: true });

  if (!existsSync(targetPath)) {
    renameSync(sourcePath, targetPath);
    return { type: 'moved', sourcePath, targetPath };
  }

  const sourceData = readFileSync(sourcePath);
  const targetData = readFileSync(targetPath);
  if (buffersEqual(sourceData, targetData)) {
    unlinkSync(sourcePath);
    return { type: 'removed-duplicate', sourcePath, targetPath };
  }

  const backupDir = path.join(agentDir, CONFLICT_BACKUP_DIR);
  mkdirSync(backupDir, { recursive: true });
  const backupPath = nextBackupPath(backupDir, path.basename(legacyFile.targetRelativePath));
  renameSync(sourcePath, backupPath);
  return { type: 'backed-up-conflict', sourcePath, targetPath, backupPath };
}

/**
 * Move legacy agent-owned config files from the profile root into agent/.
 *
 * Most files keep the same relative path under `agent/`. Legacy Google OAuth
 * config is the exception: old `google-auth.json` moves into the plugin-owned
 * `agent/plugin-config/sero-google-plugin.json` path.
 *
 * If a target file already exists:
 * - identical source files are deleted from the root
 * - differing source files are preserved under agent/legacy-root-configs/
 */
export function migrateLegacyProfileRootConfigsSync(
  profileHome: string,
  agentDir: string,
): void {
  const normalizedProfileHome = path.resolve(profileHome);
  const normalizedAgentDir = path.resolve(agentDir);

  if (
    normalizedAgentDir === normalizedProfileHome ||
    path.dirname(normalizedAgentDir) !== normalizedProfileHome
  ) {
    console.warn(
      '[sero:profile] Skipping legacy config migration: agent dir is not a direct child of the profile root',
      { profileHome: normalizedProfileHome, agentDir: normalizedAgentDir },
    );
    return;
  }

  const actions: MigrationAction[] = [];

  for (const legacyFile of LEGACY_PROFILE_ROOT_CONFIG_FILES) {
    try {
      const action = migrateOneFile(normalizedProfileHome, normalizedAgentDir, legacyFile);
      if (action) actions.push(action);
    } catch (err) {
      console.warn(`[sero:profile] Failed to migrate legacy config ${legacyFile.sourceName}:`, err);
    }
  }

  for (const action of actions) {
    if (action.type === 'moved') {
      console.log(`[sero:profile] Moved legacy config ${action.sourcePath} → ${action.targetPath}`);
      continue;
    }
    if (action.type === 'removed-duplicate') {
      console.log(`[sero:profile] Removed duplicate legacy config ${action.sourcePath}`);
      continue;
    }
    console.log(
      `[sero:profile] Preserved conflicting legacy config ${action.sourcePath} → ${action.backupPath} (active file: ${action.targetPath})`,
    );
  }
}
