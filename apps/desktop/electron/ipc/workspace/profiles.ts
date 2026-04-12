/**
 * Profile IPC handlers — CRUD operations + profile switching.
 *
 * Profile switch triggers app.relaunch() + app.exit() for a clean
 * restart with the new profile's SERO_HOME.
 */

import { app, dialog, ipcMain } from 'electron';
import { IpcChannels } from '@/types/ipc';
import { profileManager } from '@electron/features/profile/manager';
import {
  applyLegacyProviderDefaultsMigration,
  buildGlobalModelConfigState,
  setGlobalModelConfig,
} from '@electron/shared/settings/model-config';
import { getProviderHealthSnapshot } from '@electron/features/onboarding/provider-health';
import { readSettings, writeSettings } from '@electron/shared/settings/settings-helpers';
import { copyProfileDataSync, profileHasTransferableData } from '@electron/features/profile/copy-profile-data';

import type { ProfileInfo } from '@/types/profile';
import type { GlobalModelConfigInput, GlobalModelConfigState } from '@/types/ipc';

async function loadGlobalModelConfigState(): Promise<GlobalModelConfigState> {
  const migrated = applyLegacyProviderDefaultsMigration(readSettings());
  if (migrated.changed) {
    writeSettings(migrated.settings);
  }

  const { availableModelGroups } = await getProviderHealthSnapshot();
  return buildGlobalModelConfigState(
    migrated.settings,
    availableModelGroups,
    migrated.migrationNotice,
  );
}

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

  /** Create a new profile. Optionally copies credentials/config from another profile. */
  ipcMain.handle(
    IpcChannels.profiles.create,
    async (_e, name: string, profilePath?: string, copyAuthFromId?: string): Promise<ProfileInfo> => {
      const entry = await profileManager.create(name, profilePath);

      if (copyAuthFromId) {
        const source = profileManager.findById(copyAuthFromId);
        if (source) {
          copyProfileDataSync(source.path, entry.path);
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
   * List profiles that have transferable credentials/config available.
   * Used by the profile creation form to offer the copy option.
   * Includes the active profile — the user is creating a NEW profile and
   * likely wants to copy credentials from the one they're currently using.
   */
  ipcMain.handle(
    IpcChannels.profiles.listAuthSources,
    (): ProfileInfo[] => {
      const all = profileManager.list();
      return all.filter((p) => profileHasTransferableData(p.path));
    },
  );

  // ── Global Model Config ───────────────────────────────────────

  ipcMain.handle(
    IpcChannels.modelConfig.get,
    async (): Promise<GlobalModelConfigState> => loadGlobalModelConfigState(),
  );

  ipcMain.handle(
    IpcChannels.modelConfig.set,
    async (_e, config: GlobalModelConfigInput): Promise<GlobalModelConfigState> => {
      const updated = setGlobalModelConfig(readSettings(), config);
      writeSettings(updated);
      return loadGlobalModelConfigState();
    },
  );
}
