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

export function GoalDeleteButton({ busy, onDelete }: { busy: boolean; onDelete: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          className="shrink-0 text-room-text3 hover:text-status-error"
          disabled={busy}
          title="Delete Goal"
          aria-label="Delete Goal"
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this Goal?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes its objective, evidence, usage, and history from Orchestrator.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDelete}>Delete Goal</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
