/**
 * ProfileSwitcher — dropdown in the TitleBar for switching profiles.
 *
 * Shows the current profile name with a badge. Clicking opens a popover
 * listing all profiles with switch/manage options. Switching triggers an
 * app restart.
 *
 * Always renders as long as profiles exist (even if activeProfile is
 * temporarily null during hydration).
 */

import { useState } from 'react';
import { Button } from '@sero/ui/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@sero/ui/components/ui/popover';
import { User, Check, Plus, Loader2 } from 'lucide-react';
import { useProfileStore, switchProfile } from '@/stores/profiles';
import { CreateProfileDialog } from './CreateProfileDialog';

export function ProfileSwitcher() {
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const isLoading = useProfileStore((s) => s.isLoading);
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

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
    try {
      await switchProfile(id);
      // App restarts — this won't execute
    } catch {
      setSwitching(null);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="no-drag flex h-6 items-center gap-1.5 rounded-md px-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            disabled={isLoading}
          >
            <User className="size-3" />
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
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Profiles
              </p>
            </div>

            {profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => handleSwitch(profile.id)}
                disabled={switching !== null}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
              >
                <span className="flex size-4 items-center justify-center">
                  {switching === profile.id ? (
                    <Loader2 className="size-3 animate-spin text-[var(--text-muted)]" />
                  ) : profile.isActive ? (
                    <Check className="size-3 text-[var(--accent-primary)]" />
                  ) : null}
                </span>
                <span
                  className={
                    profile.isActive
                      ? 'font-medium text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)]'
                  }
                >
                  {profile.name}
                </span>
              </button>
            ))}

            <div className="my-1 h-px bg-[var(--border-default)]" />

            <button
              onClick={() => {
                setOpen(false);
                setShowCreate(true);
              }}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
            >
              <Plus className="size-3" />
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
