/**
 * Profile IPC handlers — CRUD operations + profile switching.
 *
 * Profile switch triggers app.relaunch() + app.exit() for a clean
 * restart with the new profile's SERO_HOME.
 */

import { app, dialog, ipcMain } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import { profileManager } from '@electron/features/profile/manager';
import {
  containerCleanupService,
  readProfileWorkspaceIdentities,
} from '@electron/features/workspace/runtime/container-cleanup';
import { clearLoadedProfileEnvForRelaunch } from '@electron/platform/env';
import {
  applyLegacyProviderDefaultsMigration,
  buildGlobalModelConfigState,
  setGlobalModelConfig,
} from '@electron/shared/settings/model-config';
import { getProviderHealthSnapshot } from '@electron/features/onboarding/provider-health';
import {
  readSettingsResult,
  writeSettings,
} from '@electron/shared/settings/settings-helpers';
import { copyProfileDataSync, profileHasTransferableData } from '@electron/features/profile/copy-profile-data';

import type { ProfileInfo, ProfileRemovalMode } from '@/types/profile';
import type { GlobalModelConfigInput, GlobalModelConfigState } from '@/types/ipc';

function readSettingsForModelConfig(): Record<string, unknown> {
  const result = readSettingsResult();
  if (!result.ok) {
    throw result.error;
  }
  return result.settings;
}

async function loadGlobalModelConfigState(): Promise<GlobalModelConfigState> {
  const migrated = applyLegacyProviderDefaultsMigration(readSettingsForModelConfig());
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
    return profileManager.list().find((profile) => profile.isActive) ?? null;
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

      const created = profileManager.list().find((profile) => profile.id === entry.id);
      if (!created) throw new Error(`Created profile not found: ${entry.id}`);
      return created;
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

      // Relaunch the app so env.ts picks up the new active profile.
      // Drop keys injected from the previous profile's agent/.env first;
      // otherwise Electron's child process inherits provider credentials and
      // a fresh profile can incorrectly look configured during onboarding.
      clearLoadedProfileEnvForRelaunch();
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

  /** Remove an inactive profile, with optional safe managed-folder deletion. */
  ipcMain.handle(
    IpcChannels.profiles.remove,
    async (_e, id: string, mode: ProfileRemovalMode = 'remove'): Promise<void> => {
      const profile = profileManager.findById(id);
      if (!profile) throw new Error(`Profile not found: ${id}`);
      const profiles = profileManager.list();
      if (profiles.length <= 1) throw new Error('Cannot remove the only profile');
      if (profile.id === profileManager.getActiveId()) {
        throw new Error('Cannot remove the active profile. Switch to another profile first.');
      }
      if (mode === 'delete-files' && !profiles.find((candidate) => candidate.id === id)?.canDeleteFiles) {
        throw new Error('Sero cannot verify that it manages this profile folder.');
      }
      const registered = await readProfileWorkspaceIdentities(profile);
      for (const workspace of registered.workspaces) {
        await containerCleanupService.requestDeletion(workspace).catch((error) => {
          console.warn(`[profiles] Could not queue container cleanup for ${workspace.workspaceId}:`, error);
        });
      }
      await profileManager.remove(id, mode);
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
      const updated = setGlobalModelConfig(readSettingsForModelConfig(), config);
      writeSettings(updated);
      return loadGlobalModelConfigState();
    },
  );
}
