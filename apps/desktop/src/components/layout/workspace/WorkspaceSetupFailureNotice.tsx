import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import type { WorkspaceSetupFailure } from './workspace-setup';

export function WorkspaceSetupFailureNotice({
  failure,
  onDismiss,
  embedded = false,
}: {
  failure: WorkspaceSetupFailure;
  onDismiss: () => void;
  embedded?: boolean;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col gap-2 rounded-md border border-status-error-border bg-[var(--bg-elevated)] p-3',
        embedded ? 'w-full' : 'fixed right-4 bottom-4 z-[60] w-80 shadow-lg',
      )}
    >
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">Workspace setup failed</p>
        <p className="text-xs text-[var(--text-secondary)]">
          Setup did not finish for &quot;{failure.workspace.name}&quot;.
        </p>
      </div>
      <p className="text-sm text-status-error">{failure.message}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-end"
        onClick={onDismiss}
      >
        Dismiss
      </Button>
    </div>
  );
}
