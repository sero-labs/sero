import { useState } from 'react';
import { Minus } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sero-ai/ui/components/ui/popover';
import { IconAction } from '@/components/ui/IconAction';

interface WorkspaceCloseMenuProps {
  workspaceName: string;
  /** Absolute path shown in the delete confirmation so the user sees exactly what is erased. */
  workspacePath: string;
  /** Remove from the sidebar, keep files on disk. */
  onClose: () => void;
  /** Permanently erase the folder from disk. */
  onDelete: () => void;
}

/**
 * The workspace "−" action. Opens a small menu asking whether to Close (unregister,
 * keep files) or Delete (erase from disk). Delete requires a second, explicit
 * confirmation because it is irreversible and can remove real project folders.
 */
export function WorkspaceCloseMenu({ workspaceName, workspacePath, onClose, onDelete }: WorkspaceCloseMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setConfirmingDelete(false); // Always reopen on the first step.
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <IconAction
          as="span"
          role="button"
          tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setOpen(true); } }}
          title="Close or delete workspace"
        >
          <Minus className="size-3" />
        </IconAction>
      </PopoverTrigger>
      <PopoverContent align="start" side="right" className="w-64 p-3" onClick={(e) => e.stopPropagation()}>
        {!confirmingDelete ? (
          <>
            <p className="mb-1 truncate text-sm font-medium text-[var(--text-primary)]" title={workspaceName}>
              {workspaceName}
            </p>
            <p className="mb-3 text-xs text-[var(--text-secondary)]">
              Close removes it from the sidebar. Delete permanently erases the folder from disk.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-base"
                onClick={(e) => { e.stopPropagation(); setOpen(false); }}
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-6 px-2 text-base"
                onClick={(e) => { e.stopPropagation(); setOpen(false); onClose(); }}
              >
                Close
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-6 px-2 text-base"
                onClick={(e) => { e.stopPropagation(); setConfirmingDelete(true); }}
              >
                Delete
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-1 text-sm font-medium text-status-error">Delete this workspace?</p>
            <p className="mb-2 text-xs text-[var(--text-secondary)]">
              This permanently deletes the folder and everything in it. It cannot be undone.
            </p>
            <p
              className="mb-3 truncate rounded bg-[var(--bg-base)] px-1.5 py-1 font-mono text-[11px] text-[var(--text-muted)]"
              title={workspacePath}
            >
              {workspacePath}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-base"
                onClick={(e) => { e.stopPropagation(); setConfirmingDelete(false); }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-6 px-2 text-base"
                onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(); }}
              >
                Delete permanently
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
