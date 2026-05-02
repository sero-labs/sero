/**
 * Profile store — manages profile state in the renderer.
 *
 * Hydrated from IPC on startup. The store tracks the current profile
 * and all available profiles. Profile switching triggers an app restart
 * so the store doesn't need to handle live profile changes.
 */

import { create } from 'zustand';
import type { ProfileInfo } from '@/types/ipc';

type ProfileOperation = 'create' | 'switch';

const PROFILE_RESTART_HINT = 'If the action succeeds, Sero restarts automatically.';

function getProfileOperationError(operation: ProfileOperation, err: unknown): string {
  const defaultMessage = operation === 'create'
    ? 'Failed to create profile'
    : 'Failed to switch profile';
  const detail = err instanceof Error && err.message.trim().length > 0
    ? err.message.trim()
    : null;

  return detail
    ? `${detail} ${PROFILE_RESTART_HINT}`
    : `${defaultMessage}. ${PROFILE_RESTART_HINT}`;
}

interface ProfileState {
  /** All registered profiles. */
  profiles: ProfileInfo[];
  /** The currently active profile (null before hydration or if no profile). */
  activeProfile: ProfileInfo | null;
  /** True once profiles have been loaded from main process. */
  ready: boolean;
  /** Whether any active profile exists (determines if setup screen shows). */
  hasActiveProfile: boolean;
  /** True while a profile operation is in progress. */
  isLoading: boolean;
  /** Error message from the last failed operation. */
  error: string | null;

  // Actions
  setProfiles: (profiles: ProfileInfo[]) => void;
  setActiveProfile: (profile: ProfileInfo | null) => void;
  setReady: (ready: boolean, hasActive: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profiles: [],
  activeProfile: null,
  ready: false,
  hasActiveProfile: false,
  isLoading: false,
  error: null,

  setProfiles: (profiles) => set({ profiles }),
  setActiveProfile: (profile) => set({ activeProfile: profile }),
  setReady: (ready, hasActive) => set({ ready, hasActiveProfile: hasActive }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));

// ── Startup hydration ─────────────────────────────────────────

/**
 * Load profile state from the main process. Call once on startup.
 * Must complete before the app decides whether to show ProfileSetup or the shell.
 */
export async function loadProfiles(): Promise<void> {
  try {
    const [hasActive, profiles, active] = await Promise.all([
      window.sero.profiles.hasActive(),
      window.sero.profiles.list(),
      window.sero.profiles.getActive(),
    ]);

    useProfileStore.setState({
      profiles,
      activeProfile: active,
      hasActiveProfile: hasActive,
      ready: true,
    });
  } catch (err) {
    console.error('[profiles] Failed to load profiles:', err);
    useProfileStore.setState({ ready: true, hasActiveProfile: false });
  }
}

// ── Actions ───────────────────────────────────────────────────

function failProfileOperation(operation: ProfileOperation, err: unknown): never {
  useProfileStore.setState({
    isLoading: false,
    error: getProfileOperationError(operation, err),
  });
  throw err;
}

export function clearProfileError(): void {
  useProfileStore.setState({ error: null });
}

/** Create a new profile. If activate=true (default for first profile), triggers restart. */
export async function createProfile(
  name: string,
  profilePath?: string,
  activate = false,
  copyAuthFromId?: string,
): Promise<ProfileInfo> {
  useProfileStore.setState({ isLoading: true, error: null });

  let profile: ProfileInfo;
  let profiles: ProfileInfo[];
  try {
    profile = await window.sero.profiles.create(name, profilePath, copyAuthFromId);
    profiles = await window.sero.profiles.list();
  } catch (err) {
    failProfileOperation('create', err);
  }

  useProfileStore.setState({ profiles, isLoading: false });

  // If this is the first profile or activate requested, switch to it
  if (activate || profiles.length === 1) {
    await switchProfile(profile.id);
  }

  return profile;
}

/** Switch to a different profile. Triggers app restart. */
export async function switchProfile(id: string): Promise<void> {
  useProfileStore.setState({ isLoading: true, error: null });
  try {
    await window.sero.profiles.switch(id);
    // App will restart — this line may not execute
  } catch (err) {
    failProfileOperation('switch', err);
  }
}

