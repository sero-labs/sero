/**
 * ProfileSwitcher, dropdown in the TitleBar for switching profiles.
 *
 * Shows the current profile name with a badge. Clicking opens a popover
 * listing all profiles with switch/manage options. Switching triggers an
 * app restart.
 *
 * Always renders as long as profiles exist (even if activeProfile is
 * temporarily null during hydration).
 */

import { useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@sero-ai/ui/components/ui/popover';
import { User, Check, Plus, Loader2 } from 'lucide-react';
import { removeProfile, switchProfile, useProfileStore } from '@/stores/profiles';
import type { ProfileRemovalMode } from '@/types/profile';
import { CreateProfileDialog } from './CreateProfileDialog';
import { ProfileRemovalMenu } from './ProfileRemovalMenu';
import { useProfileOperationState } from './useProfileOperationState';

export function ProfileSwitcher() {
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const {
    isLoading,
    error,
    clearError,
    runProfileOperation,
  } = useProfileOperationState();
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  // Don't render if there are no profiles at all
  if (profiles.length === 0) return null;

  // Display name: active profile name, or first profile, or "Profile"
  const displayName = activeProfile?.name
    ?? profiles.find((p) => p.isActive)?.name
    ?? 'Profile';

  const activeId = activeProfile?.id
    ?? profiles.find((p) => p.isActive)?.id;

  const handleSwitch = async (id: string) => {
    if (id === activeId) return;
    setSwitching(id);
    await runProfileOperation(
      () => switchProfile(id),
      () => setSwitching(null),
    );
    // App restarts on success.
  };

  const handleRemove = async (id: string, mode: ProfileRemovalMode) => {
    setRemoving(id);
    await runProfileOperation(
      () => removeProfile(id, mode),
      () => setRemoving(null),
    );
    setRemoving(null);
  };

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            clearError();
            setSwitching(null);
          }
          setOpen(nextOpen);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="no-drag flex h-6 items-center gap-1.5 rounded-md px-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            disabled={isLoading}
          >
            <User className="size-3.5" />
            <span className="max-w-[120px] truncate">{displayName}</span>
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={4}
          className="w-56 p-1"
        >
          <div className="flex flex-col">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Profiles
              </p>
            </div>

            {profiles.map((profile) => (
              <div key={profile.id} className="flex items-center rounded-md hover:bg-[var(--bg-elevated)]">
                <button type="button"
                  onClick={() => handleSwitch(profile.id)}
                  disabled={switching !== null || removing !== null}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors disabled:opacity-50"
                >
                  <span className="flex size-4 items-center justify-center">
                    {switching === profile.id || removing === profile.id ? (
                      <Loader2 className="size-3 animate-spin text-[var(--text-muted)]" />
                    ) : profile.isActive ? (
                      <Check className="size-3 text-[var(--accent-primary)]" />
                    ) : null}
                  </span>
                  <span
                    className={`truncate ${profile.isActive
                      ? 'font-medium text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)]'}`}
                  >
                    {profile.name}
                  </span>
                </button>
                {!profile.isActive && profiles.length > 1 && (
                  <ProfileRemovalMenu
                    profile={profile}
                    disabled={switching !== null || removing !== null}
                    onRemove={(mode) => { void handleRemove(profile.id, mode); }}
                  />
                )}
              </div>
            ))}

            <div className="my-1 h-px bg-[var(--border-default)]" />

            {error && (
              <p className="px-2 py-1 text-sm text-status-error">{error}</p>
            )}

            <button type="button"
              onClick={() => {
                clearError();
                setOpen(false);
                setShowCreate(true);
              }}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
            >
              <Plus className="size-3.5" />
              <span>New Profile</span>
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <CreateProfileDialog
        open={showCreate}
        onOpenChange={setShowCreate}
      />
    </>
  );
}
