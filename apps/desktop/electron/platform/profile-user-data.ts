import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'fs';
import path from 'path';

export const PROFILE_USER_DATA_DIRNAME = 'chromium-user-data';

export function profileUserDataPath(seroHome: string): string {
  return path.join(seroHome, PROFILE_USER_DATA_DIRNAME);
}

export function legacyProfileUserDataPath(
  defaultUserDataPath: string,
  activeProfileId: string,
): string {
  return path.join(defaultUserDataPath, 'profiles', activeProfileId);
}

export function migrateLegacyProfileUserData(
  legacyPath: string,
  targetPath: string,
): void {
  if (existsSync(targetPath) || !existsSync(legacyPath)) return;

  mkdirSync(path.dirname(targetPath), { recursive: true });
  try {
    renameSync(legacyPath, targetPath);
    console.log('[sero:profile] Moved Chromium user data to', targetPath);
  } catch (error) {
    try {
      cpSync(legacyPath, targetPath, { recursive: true });
      rmSync(legacyPath, { recursive: true, force: true });
      console.log('[sero:profile] Copied Chromium user data to', targetPath);
    } catch {
      console.warn('[sero:profile] Failed to move legacy Chromium user data:', error);
    }
  }
}
