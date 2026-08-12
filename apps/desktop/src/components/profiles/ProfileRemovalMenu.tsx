import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sero-ai/ui/components/ui/dialog';
import type { ProfileInfo, ProfileRemovalMode } from '@/types/profile';

interface ProfileRemovalMenuProps {
  profile: ProfileInfo;
  disabled: boolean;
  onRemove: (mode: ProfileRemovalMode) => void;
}

export function ProfileRemovalMenu({ profile, disabled, onRemove }: ProfileRemovalMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmingFileDeletion, setConfirmingFileDeletion] = useState(false);

  const finishRemoval = (mode: ProfileRemovalMode) => {
    setOpen(false);
    onRemove(mode);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setConfirmingFileDeletion(false);
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Manage ${profile.name}`}
          disabled={disabled}
          onClick={(event) => event.stopPropagation()}
          className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)] disabled:opacity-50"
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-sm"
        onClick={(event) => event.stopPropagation()}
      >
        {!confirmingFileDeletion ? (
          <>
            <DialogHeader>
              <DialogTitle>Remove profile</DialogTitle>
              <DialogDescription>
                Choose what to do with the files for {profile.name}.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-row flex-nowrap justify-end">
              <Button
                variant="secondary"
                className="whitespace-nowrap"
                onClick={() => finishRemoval('remove')}
              >
                Retain files
              </Button>
              {profile.canDeleteFiles && (
                <Button
                  variant="destructive"
                  className="whitespace-nowrap"
                  onClick={() => setConfirmingFileDeletion(true)}
                >
                  Delete files
                </Button>
              )}
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Are you sure?</DialogTitle>
              <DialogDescription>
                The profile folder and its workspaces will be deleted. You cannot undo this.
              </DialogDescription>
            </DialogHeader>
            <p
              className="truncate rounded bg-[var(--bg-base)] px-2 py-1.5 font-mono text-xs text-[var(--text-muted)]"
              title={profile.path}
            >
              {profile.path}
            </p>
            <DialogFooter className="flex-row flex-nowrap justify-end">
              <Button
                variant="ghost"
                className="whitespace-nowrap"
                onClick={() => setConfirmingFileDeletion(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="whitespace-nowrap"
                onClick={() => finishRemoval('delete-files')}
              >
                Delete
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
