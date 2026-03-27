/**
 * Profile IPC handlers — CRUD operations + profile switching.
 *
 * Profile switch triggers app.relaunch() + app.exit() for a clean
 * restart with the new profile's SERO_HOME.
 */

import { app, dialog, ipcMain } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { IpcChannels } from '../../../src/types/ipc';
import { profileManager } from '../../features/profile/manager';

import type { ProfileInfo } from '../../features/profile/types';

export function registerProfileHandlers(): void {
  /** List all profiles with active flag. */
  ipcMain.handle(IpcChannels.profiles.list, (): ProfileInfo[] => {
    return profileManager.list();
  });

  /** Get the currently active profile. */
  ipcMain.handle(IpcChannels.profiles.getActive, (): ProfileInfo | null => {
    const active = profileManager.getActive();
    if (!active) return null;
    return { ...active, isActive: true };
  });

  /** Check if a valid active profile exists. */
  ipcMain.handle(IpcChannels.profiles.hasActive, (): boolean => {
    // Dynamic check — always reads current state from the profile manager,
    // not the static HAS_ACTIVE_PROFILE constant from env.ts.
    return profileManager.hasProfiles() && profileManager.getActiveId() !== null;
  });

  /** Create a new profile. Optionally copies auth.json from another profile. */
  ipcMain.handle(
    IpcChannels.profiles.create,
    async (_e, name: string, profilePath?: string, copyAuthFromId?: string): Promise<ProfileInfo> => {
      const entry = await profileManager.create(name, profilePath);

      // Copy auth.json from source profile into the new profile before restart
      if (copyAuthFromId) {
        const source = profileManager.findById(copyAuthFromId);
        if (source) {
          const srcAuth = path.join(source.path, 'agent', 'auth.json');
          if (existsSync(srcAuth)) {
            const content = readFileSync(srcAuth, 'utf8');
            const destDir = path.join(entry.path, 'agent');
            mkdirSync(destDir, { recursive: true });
            writeFileSync(path.join(destDir, 'auth.json'), content, 'utf8');
          }
        }
      }

      return { ...entry, isActive: entry.id === profileManager.getActiveId() };
    },
  );

  /**
   * Switch to a different profile.
   * Writes the new active ID to profiles.json, then relaunches.
   */
  ipcMain.handle(
    IpcChannels.profiles.switch,
    async (_e, id: string): Promise<void> => {
      await profileManager.setActive(id);

      // Relaunch the app so env.ts picks up the new active profile
      app.relaunch();
      app.exit(0);
    },
  );

  /** Rename a profile's display name. */
  ipcMain.handle(
    IpcChannels.profiles.rename,
    async (_e, id: string, newName: string): Promise<void> => {
      await profileManager.rename(id, newName);
    },
  );

  /** Delete a profile (unregister only — files are not deleted). */
  ipcMain.handle(
    IpcChannels.profiles.delete,
    async (_e, id: string): Promise<void> => {
      await profileManager.delete(id);
    },
  );

  /** Open a native folder picker for custom profile path. */
  ipcMain.handle(
    IpcChannels.profiles.pickFolder,
    async (): Promise<string | null> => {
      const result = await dialog.showOpenDialog({
        title: 'Choose Profile Location',
        message: 'Select a folder for the new profile data',
        properties: ['openDirectory', 'createDirectory'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    },
  );

  /**
   * Check if onboarding is needed for the active profile.
   * Returns false once the profile has been marked as onboarded.
   */
  ipcMain.handle(
    IpcChannels.profiles.needsOnboarding,
    async (): Promise<boolean> => {
      const active = profileManager.getActive();
      return active ? !active.onboarded : false;
    },
  );

  /** Mark the active profile as onboarded in profiles.json. */
  ipcMain.handle(
    IpcChannels.profiles.markOnboardingDone,
    async (): Promise<void> => {
      const id = profileManager.getActiveId();
      if (id) await profileManager.markOnboarded(id);
    },
  );

  /**
   * List profiles that have an auth.json available for credential import.
   * Used by the profile creation form to offer "Copy credentials from…".
   * Includes the active profile — the user is creating a NEW profile and
   * likely wants to copy credentials from the one they're currently using.
   */
  ipcMain.handle(
    IpcChannels.profiles.listAuthSources,
    (): ProfileInfo[] => {
      const all = profileManager.list();
      return all.filter((p) => {
        const authPath = path.join(p.path, 'agent', 'auth.json');
        try {
          if (!existsSync(authPath)) return false;
          const content = readFileSync(authPath, 'utf8').trim();
          // Must be a non-empty JSON object (not "{}" or empty)
          return content.length > 2 && content !== '{}';
        } catch {
          return false;
        }
      });
    },
  );

}
