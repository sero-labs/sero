import { DeleteConfirmationButton } from './DeleteConfirmationButton';

export function RoomDeleteButton({ busy, onDelete }: { busy: boolean; onDelete: () => void }) {
  return (
    <DeleteConfirmationButton
      resource="Room"
      description="This permanently removes the Room state and its persistent member session history. Sero preserves member worktree changes before deleting; if a worktree cannot be preserved, deletion is refused and the Room stays."
      busy={busy}
      onDelete={onDelete}
    />
  );
}
