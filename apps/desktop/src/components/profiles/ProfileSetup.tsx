/**
 * ProfileSetup, first-run setup screen.
 *
 * Shown when no profile exists (fresh install). Covers the entire
 * window with a clean setup flow: enter name → create profile → launch.
 */

import seroLogoDarkUrl from '@assets/logo-dark.svg';
import { createProfile } from '@/stores/profiles';
import { ProfileForm } from './ProfileForm';
import { useProfileOperationState } from './useProfileOperationState';

export function ProfileSetup() {
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

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-[var(--bg-base)]">
      <div className="flex flex-col items-center gap-8 px-6">
        {/* ── Branding ─────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-3">
          <img src={seroLogoDarkUrl} alt="Sero" className="h-16 w-auto" draggable={false} />
          <p className="max-w-xs text-center text-base text-[var(--text-muted)]">
            Create a profile to get started. Each profile has its own
            workspaces, sessions, and settings.
          </p>
        </div>

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
