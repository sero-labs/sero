/**
 * CreateProfileDialog — dialog for creating new profiles.
 *
 * Opened from the ProfileSwitcher's "New Profile" button.
 * After creation, asks if the user wants to switch to the new profile.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@sero-ai/ui/components/ui/dialog';
import { Button } from '@sero-ai/ui/components/ui/button';
import { ProfileForm } from './ProfileForm';
import { createProfile, switchProfile } from '@/stores/profiles';

interface CreateProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateProfileDialog({ open, onOpenChange }: CreateProfileDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);

  const handleCreate = async (name: string, customPath?: string, copyAuthFromId?: string) => {
    setIsLoading(true);
    try {
      const profile = await createProfile(name, customPath, false, copyAuthFromId);
      setCreated({ id: profile.id, name: profile.name });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchNow = async () => {
    if (!created) return;
    setIsLoading(true);
    try {
      await switchProfile(created.id);
      // App restarts
    } catch {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setCreated(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {created ? 'Profile Created' : 'New Profile'}
          </DialogTitle>
          <DialogDescription>
            {created
              ? `"${created.name}" is ready. Switch to it now?`
              : 'Create a new profile with its own workspaces, sessions, and settings.'}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="flex flex-col gap-3 pt-2">
            <p className="text-xs text-[var(--text-muted)]">
              Switching profiles will restart the app.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={handleClose}>
                Stay Here
              </Button>
              <Button onClick={handleSwitchNow} disabled={isLoading}>
                Switch Now
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-center pt-2">
            <ProfileForm
              submitLabel="Create Profile"
              onSubmit={handleCreate}
              isLoading={isLoading}
              autoFocus
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
