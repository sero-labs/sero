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

interface DeleteConfirmationButtonProps {
  resource: string;
  description: string;
  busy: boolean;
  onDelete: () => void;
  /**
   * When given, this renders the dialog ONLY. The caller owns the trigger, which
   * is what lets Delete Room sit behind a \u22ef menu instead of beside the view
   * controls. The confirmation itself is unchanged.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DeleteConfirmationButton({
  resource,
  description,
  busy,
  onDelete,
  open,
  onOpenChange,
}: DeleteConfirmationButtonProps) {
  const actionLabel = `Delete ${resource}`;
  const controlled = open !== undefined;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {!controlled && (
        <AlertDialogTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            className="shrink-0 text-room-text3 hover:text-status-error"
            disabled={busy}
            title={actionLabel}
            aria-label={actionLabel}
          >
            <Trash2 className="size-4" />
          </Button>
        </AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this {resource}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDelete}>{actionLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
