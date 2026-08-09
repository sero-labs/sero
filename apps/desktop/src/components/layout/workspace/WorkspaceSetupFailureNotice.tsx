import { Button } from '@sero-ai/ui/components/ui/button';
import type { WorkspaceSetupFailure } from './workspace-setup';

export function WorkspaceSetupFailureNotice({
  failure,
  onDismiss,
}: {
  failure: WorkspaceSetupFailure;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2 rounded-md border border-status-error-border bg-[var(--bg-elevated)] p-3 shadow-lg"
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
