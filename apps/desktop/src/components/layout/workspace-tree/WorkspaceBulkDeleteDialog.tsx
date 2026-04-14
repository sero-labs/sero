import { Button } from '@sero-ai/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@sero-ai/ui/components/ui/dialog';

interface WorkspaceBulkDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceName: string;
  selectedCount: number;
  onConfirm: () => Promise<void>;
}

export function WorkspaceBulkDeleteDialog({
  open,
  onOpenChange,
  workspaceName,
  selectedCount,
  onConfirm,
}: WorkspaceBulkDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Delete {selectedCount} session{selectedCount > 1 ? 's' : ''}?
          </DialogTitle>
          <DialogDescription>
            This will permanently delete {selectedCount === 1 ? 'this session' : `these ${selectedCount} sessions`} from{' '}
            <span className="font-medium text-[var(--text-primary)]">{workspaceName}</span>.
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={() => void onConfirm()}>
            Delete {selectedCount} session{selectedCount > 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
