/**
 * ProfileSetup, first-run setup screen.
 *
 * Shown when no profile is registered — a fresh install, or a registry reset
 * that left the index empty. When profile directories still exist on disk they
 * are offered above the create form, so a reset never strands them.
 */

import seroLogoDarkUrl from '@assets/logo-dark.svg';
import { Button } from '@sero-ai/ui/components/ui/button';
import { adoptProfile, createProfile, useProfileStore } from '@/stores/profiles';
import type { DiscoveredProfile } from '@/types/profile';
import { ProfileForm } from './ProfileForm';
import { useProfileOperationState } from './useProfileOperationState';

function formatLastModified(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'unknown' : date.toLocaleString();
}

function DiscoveredProfileRows({
  profiles,
  disabled,
  onOpen,
}: {
  profiles: DiscoveredProfile[];
  disabled: boolean;
  onOpen: (profile: DiscoveredProfile) => void;
}) {
  if (profiles.length === 0) return null;

  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <p className="text-sm font-medium text-[var(--text-secondary)]">
        Profiles found on this computer
      </p>
      <div className="flex flex-col gap-1.5">
        {profiles.map((profile) => (
          <div
            key={profile.path}
            className="flex items-center gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-[var(--text-primary)]">{profile.name}</p>
              <p className="truncate text-xs text-[var(--text-muted)]" title={profile.path}>
                {profile.path}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Last modified {formatLastModified(profile.lastModified)}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={disabled}
              onClick={() => onOpen(profile)}
            >
              Open
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfileSetup() {
  const discoveredProfiles = useProfileStore((state) => state.discoveredProfiles);
  const {
    isLoading,
    error,
    clearError,
    runProfileOperation,
  } = useProfileOperationState();

  const handleCreate = async (name: string, customPath?: string, copyAuthFromId?: string) => {
    // First profile is always activated (triggers app restart to load it)
    await runProfileOperation(() => createProfile(name, customPath, true, copyAuthFromId));
  };

  const handleOpen = async (profile: DiscoveredProfile) => {
    // Adoption registers the profile at its existing path and restarts into it.
    await runProfileOperation(() => adoptProfile(profile.path));
  };

  const hasDiscovered = discoveredProfiles.length > 0;

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-[var(--bg-base)]">
      <div className="flex flex-col items-center gap-8 px-6">
        {/* ── Branding ─────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-3">
          <img src={seroLogoDarkUrl} alt="Sero" className="h-16 w-auto" draggable={false} />
          <p className="max-w-xs text-center text-base text-[var(--text-muted)]">
            {hasDiscovered
              ? 'Open a profile that is already on this computer, or create a new one.'
              : 'Create a profile to get started. Each profile has its own workspaces, sessions, and settings.'}
          </p>
        </div>

        {/* ── Profiles found on disk ────────────────────────── */}
        <DiscoveredProfileRows
          profiles={discoveredProfiles}
          disabled={isLoading}
          onOpen={(profile) => void handleOpen(profile)}
        />

        {/* ── Form ─────────────────────────────────────────── */}
        <ProfileForm
          submitLabel="Get Started"
          onSubmit={handleCreate}
          operationError={error}
          onClearOperationError={clearError}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
