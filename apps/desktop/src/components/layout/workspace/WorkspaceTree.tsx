import { ChevronsDownUp, Loader2 } from 'lucide-react';
import { IconAction } from '@/components/ui/IconAction';
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
