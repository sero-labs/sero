/**
 * Onboarding dialog that advances only through its own actions.
 *
 * Blocks the close button, Escape and outside clicks so a step stays open
 * until the user continues or cancels from inside the dialog.
 */

import type { ReactNode } from 'react';
import { Dialog, DialogContent } from '@sero-ai/ui/components/ui/dialog';

interface NonDismissibleDialogProps {
  open: boolean;
  className?: string;
  children: ReactNode;
}

export function NonDismissibleDialog({ open, className, children }: NonDismissibleDialogProps) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className={className}
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}
