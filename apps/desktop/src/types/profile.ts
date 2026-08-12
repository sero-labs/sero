/**
 * Renderer-safe profile contract shared across IPC, preload, and main-process
 * profile management code.
 */
export type ProfileFolderProvenance = 'default-root' | 'sero-managed' | 'custom';

export type ProfileRemovalMode = 'remove' | 'delete-files';

export interface ProfileInfo {
  /** Unique identifier. */
  id: string;
  /** User-facing display name (editable, independent of folder name). */
  name: string;
  /** Absolute path to the profile's root directory (= SERO_HOME). */
  path: string;
  /** ISO timestamp of when the profile was created. */
  createdAt: string;
  /** How the profile folder entered the registry. Missing means uncertain legacy provenance. */
  folderProvenance?: ProfileFolderProvenance;
  /** True only when Sero can safely delete this managed profile folder. */
  canDeleteFiles: boolean;
  /** True if this is the currently active profile. */
  isActive: boolean;
  /** True once onboarding has completed for this profile. */
  onboarded?: boolean;
}
