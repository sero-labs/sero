import { AlertTriangle, ChevronsDownUp, Loader2 } from 'lucide-react';
import { IconAction } from '@/components/ui/IconAction';
import { useContainerStore, type WorkspaceContainerState } from '@/stores/container';
import { useWorkspaceStore } from '@/stores/workspace';
import { ErrorSurface } from '../ErrorSurface';
import { AddWorkspaceMenu } from './AddWorkspaceMenu';
import { WorkspaceNode } from './workspace-tree/WorkspaceNode';
import { useWorkspaceTreeRuntime } from './workspace-tree/useWorkspaceTreeRuntime';

/**
 * WorkspaceTree — tree view of workspaces → sessions.
 *
 * ▼ Scratchpad
 *    ● Fix email draft        2m ago
 *    ○ Tax questions           1h ago
 * ▼ Sero Dev              🟢
 *    ● Multi-workspace     just now
 * ▸ Global
 */
export function WorkspaceTree() {
  const {
    isLoadingWorkspaces,
    openWorkspaces,
    sessionsByWorkspace,
    openSessionError,
    clearOpenSessionError,
  } = useWorkspaceTreeRuntime();
  const containers = useContainerStore((state) => state.containers);
  const missingWorkspaces = openWorkspaces.filter((workspace) => workspace.missing);
  const preparingWorkspaces = openWorkspaces.filter((workspace) =>
    workspace.container && containers[workspace.id]?.status === 'starting',
  );
  const runtimeErrorWorkspaces = openWorkspaces.filter((workspace) =>
    workspace.container && containers[workspace.id]?.status === 'error',
  );

  if (isLoadingWorkspaces) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-4 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {openSessionError ? (
        <ErrorSurface
          className="mx-2 mb-2"
          title="Couldn't open workspace"
          message={openSessionError}
          onDismiss={clearOpenSessionError}
        />
      ) : null}

      {missingWorkspaces.length > 0 ? <MissingWorkspaceNotice workspaces={missingWorkspaces} /> : null}
      {preparingWorkspaces.length > 0 ? <RuntimePreparingNotice workspaces={preparingWorkspaces} /> : null}
      {runtimeErrorWorkspaces.length > 0 ? (
        <RuntimeErrorNotice workspaces={runtimeErrorWorkspaces} containers={containers} />
      ) : null}

      <div className="flex items-center justify-between px-2 pb-1">
        <span className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Workspaces
        </span>
        <div className="flex items-center gap-0.5">
          <CollapseAllButton />
          <AddWorkspaceMenu />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {openWorkspaces.map((workspace) => (
          <WorkspaceNode
            key={workspace.id}
            workspace={workspace}
            sessions={sessionsByWorkspace[workspace.id] ?? []}
          />
        ))}

        {openWorkspaces.length === 0 && (
          <span className="px-2 py-4 text-center text-sm text-[var(--text-muted)]">
            No workspaces open
          </span>
        )}
      </div>
    </div>
  );
}

function RuntimePreparingNotice({ workspaces }: { workspaces: Array<{ id: string; name: string }> }) {
  const names = workspaces.map((workspace) => workspace.name).join(', ');

  return (
    <div className="mx-2 mb-2 rounded-md border border-[var(--status-info-border)] bg-[var(--status-info-faint)] p-2 text-xs text-[var(--text-secondary)]">
      <div className="flex items-start gap-2">
        <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-[var(--status-info)]" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[var(--text-primary)]">Preparing container runtime</p>
          <p className="mt-0.5">
            {names} {workspaces.length === 1 ? 'is' : 'are'} starting. First launch may pull the Sero runtime image and take a few minutes.
          </p>
        </div>
      </div>
    </div>
  );
}

function RuntimeErrorNotice({
  workspaces,
  containers,
}: {
  workspaces: Array<{ id: string; name: string }>;
  containers: Record<string, WorkspaceContainerState>;
}) {
  const first = workspaces[0];
  const error = first ? containers[first.id]?.error : undefined;
  const names = workspaces.map((workspace) => workspace.name).join(', ');

  return (
    <div className="mx-2 mb-2 rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-faint)] p-2 text-xs text-[var(--status-error)]">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Container runtime unavailable</p>
          <p className="mt-0.5 text-[var(--status-error)]/85">
            {names} {workspaces.length === 1 ? 'has' : 'have'} a runtime error. Terminal and agent actions may fall back to the host until it recovers.
          </p>
          {error ? <p className="mt-1 line-clamp-2 text-[var(--status-error)]/80">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}

function MissingWorkspaceNotice({ workspaces }: { workspaces: Array<{ id: string; name: string; path: string }> }) {
  const loadWorkspaces = useWorkspaceStore((state) => state.loadWorkspaces);
  const names = workspaces.map((workspace) => workspace.name).join(', ');

  return (
    <div className="mx-2 mb-2 rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-muted)] p-2 text-xs text-[var(--status-warning)]">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Workspace folder unavailable</p>
          <p className="mt-0.5 text-[var(--status-warning)]/85">
            {names} {workspaces.length === 1 ? 'points' : 'point'} to a folder that is missing right now. Sero kept the registry entry in case the folder is on removable media.
          </p>
          <button
            type="button"
            className="mt-1 underline underline-offset-2 hover:text-[var(--text-primary)]"
            onClick={() => void loadWorkspaces()}
          >
            Check again
          </button>
        </div>
      </div>
    </div>
  );
}

function CollapseAllButton() {
  const collapseAll = useWorkspaceStore((state) => state.collapseAll);
  const hasExpanded = useWorkspaceStore((state) => state.workspaces.some((workspace) => workspace.open));

  if (!hasExpanded) {
    return null;
  }

  return (
    <IconAction
      onClick={collapseAll}
      className="rounded-md hover:bg-[var(--bg-elevated)]"
      title="Collapse all"
    >
      <ChevronsDownUp className="size-3.5" />
    </IconAction>
  );
}
