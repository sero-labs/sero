import { Button } from '@sero-ai/ui/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@sero-ai/ui/components/ui/alert-dialog';
import { Trash2 } from 'lucide-react';

export function RoomDeleteButton({ busy, onDelete }: { busy: boolean; onDelete: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          className="shrink-0 text-room-text3 hover:text-status-error"
          disabled={busy}
          title="Delete Room"
          aria-label="Delete Room"
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this Room?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the Room state and its persistent member session history. Sero preserves member worktree changes before deleting; if a worktree cannot be preserved, deletion is refused and the Room stays.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDelete}>Delete Room</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
