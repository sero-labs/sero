/**
 * Profile system types.
 *
 * A profile is an independent Sero environment with its own SERO_HOME.
 * Each profile has completely isolated state: workspaces, sessions,
 * auth tokens, settings, app data, etc.
 *
 * The profile registry lives at a fixed path (~/.sero-ui/profiles.json)
 * and is read before anything else to determine which SERO_HOME to use.
 */

import type { ProfileFolderProvenance } from '@/types/profile';

/** A single profile entry in the registry. */
export interface ProfileEntry {
  /** Unique identifier (UUID v4). */
  id: string;
  /** User-facing display name (editable, independent of folder name). */
  name: string;
  /** Absolute path to the profile's root directory (= SERO_HOME). */
  path: string;
  /** ISO timestamp of when the profile was created. */
  createdAt: string;
  /** Positive folder origin. Missing means uncertain legacy provenance. */
  folderProvenance?: ProfileFolderProvenance;
  /** True once onboarding has completed for this profile. */
  onboarded?: boolean;
}

/** The profiles.json schema. */
export interface ProfileRegistry {
  /** Schema version for future migrations. */
  version: 1;
  /** ID of the currently active profile (null = none, show setup). */
  activeProfileId: string | null;
  /** All registered profiles. */
  profiles: ProfileEntry[];
}

export type { ProfileInfo } from '@/types/profile';

/** Result of a profile switch operation. */
export interface ProfileSwitchResult {
  /** True if the switch was initiated (app will restart). */
  success: boolean;
  /** Error message if switch failed. */
  error?: string;
}
