import { DeleteConfirmationButton } from './DeleteConfirmationButton';

/**
 * Delete a Room, behind its ⋯ menu.
 *
 * `open`/`onOpenChange` let the menu own the trigger: the dialog still asks, and
 * still explains what is preserved, but the control no longer sits beside the
 * Room's view controls where a destructive action gets clicked by accident.
 */
export function RoomDeleteButton({ busy, onDelete, open, onOpenChange }: {
  busy: boolean;
  onDelete: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <DeleteConfirmationButton
      resource="Room"
      description="This permanently removes the Room state and its persistent member session history. Sero preserves member worktree changes before deleting; if a worktree cannot be preserved, deletion is refused and the Room stays."
      busy={busy}
      onDelete={onDelete}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}
