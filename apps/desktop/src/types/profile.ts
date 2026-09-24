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

/** A profile found on disk that the registry does not reference. */
export interface DiscoveredProfile {
  /** Recorded id when a broken backup recorded one, otherwise a scan id. */
  id: string;
  /** Recorded name when available, otherwise the directory name. */
  name: string;
  /** Absolute path the profile already occupies. */
  path: string;
  /** ISO timestamp of the newest profile-file modification. */
  lastModified: string;
  /**
   * Recorded folder ownership from a broken registry. Absent means ownership
   * is unknown, and an unknown folder is never eligible for deletion.
   */
  folderProvenance?: ProfileFolderProvenance;
  /** Recorded onboarding state from a broken registry, when one carried it. */
  onboarded?: boolean;
}
