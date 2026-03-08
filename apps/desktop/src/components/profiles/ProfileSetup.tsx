/**
 * ProfileSetup — first-run setup screen.
 *
 * Shown when no profile exists (fresh install). Covers the entire
 * window with a clean setup flow: enter name → create profile → launch.
 */

import { useProfileStore, createProfile } from '@/stores/profiles';
import { ProfileForm } from './ProfileForm';

export function ProfileSetup() {
  const isLoading = useProfileStore((s) => s.isLoading);

  const handleCreate = async (name: string, customPath?: string, copyAuthFromId?: string) => {
    // First profile is always activated (triggers app restart to load it)
    await createProfile(name, customPath, true, copyAuthFromId);
  };

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-[var(--bg-base)]">
      <div className="flex flex-col items-center gap-8 px-6">
        {/* ── Branding ─────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-[var(--bg-elevated)] shadow-lg">
            <span className="text-2xl font-bold text-[var(--text-primary)]">S</span>
          </div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            Welcome to Sero
          </h1>
          <p className="max-w-xs text-center text-sm text-[var(--text-muted)]">
            Create a profile to get started. Each profile has its own
            workspaces, sessions, and settings.
          </p>
        </div>

        {/* ── Form ─────────────────────────────────────────── */}
        <ProfileForm
          submitLabel="Get Started"
          onSubmit={handleCreate}
          isLoading={isLoading}
          autoFocus
        />
      </div>
    </div>
  );
}
