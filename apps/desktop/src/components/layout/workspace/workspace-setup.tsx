import { Button } from '@sero-ai/ui/components/ui/button';
import type { AppEntry } from '@/stores/app';
import type { WorkspaceInfo } from '@/types/ipc';

export interface WorkspaceSetupFailure {
  workspace: WorkspaceInfo;
  message: string;
}

export async function runWorkspaceSetup({
  apps,
  selections,
  workspace,
}: {
  apps: AppEntry[];
  selections: Record<string, boolean>;
  workspace: WorkspaceInfo;
}): Promise<string | null> {
  const enabledApps = apps.filter((app) => (
    selections[app.id]
      ?? app.manifest!.workspaceCreation!.defaultEnabled
      ?? false
  ));
  const results = await Promise.allSettled(enabledApps.map((app) => Promise.resolve().then(() => {
    const contribution = app.manifest!.workspaceCreation!;
    return window.sero.appAgent.invokeTool(app.id, workspace.id, contribution.tool, {
      ...contribution.params,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspacePath: workspace.path,
    });
  })));
  const failures = results.flatMap((result, index) => {
    const label = enabledApps[index].label;
    if (result.status === 'rejected') {
      const message = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
      return [`${label}: ${message}`];
    }
    if (result.value.isError) {
      return [`${label}: ${result.value.text || 'Setup failed.'}`];
    }
    return [];
  });
  return failures.length > 0 ? failures.join(' ') : null;
}

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
