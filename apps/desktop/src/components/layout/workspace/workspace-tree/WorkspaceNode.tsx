import { memo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  GitBranch,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { WorkspaceInfo, SeroSessionInfo } from '@/types/ipc';
import { IconAction } from '@/components/ui/IconAction';
import { SessionNode } from '../SessionNode';
import { WorkspaceReferencesMenu } from '../WorkspaceReferencesMenu';
import { RemoteOriginManager } from '../RemoteOriginManager';
import { RuntimePickerMenu } from './RuntimePickerMenu';
import { useSessionStore } from '@/stores/sessions';
import { type ContainerStatus, useWorkspaceContainer } from '@/stores/container';
import { useWorkspaceStore } from '@/stores/workspace';
import { WorkspaceBulkDeleteDialog } from './WorkspaceBulkDeleteDialog';
import { WorkspaceCloseMenu } from './WorkspaceCloseMenu';

function ContainerIndicator({ workspaceId, containerEnabled }: { workspaceId: string; containerEnabled: boolean }) {
  const container = useWorkspaceContainer(workspaceId);

  if (!containerEnabled || container.status === 'none') {
    return null;
  }

  const config: Record<ContainerStatus, { color: string; title: string; animate?: boolean }> = {
    none: { color: '', title: '' },
    starting: { color: 'bg-status-warning', title: 'Container starting...', animate: true },
    running: {
      color: 'bg-status-success',
      title: container.ipAddress ? `Container running (${container.ipAddress})` : 'Container running',
    },
    stopped: { color: 'bg-zinc-500', title: 'Container stopped' },
    error: {
      color: 'bg-status-error',
      title: container.error ? `Container error: ${container.error}` : 'Container error',
    },
  };

  const { color, title, animate } = config[container.status];

  return (
    <span
      className={cn('size-1.5 shrink-0 rounded-full', color, animate && 'animate-pulse')}
      title={title}
    />
  );
}

interface WorkspaceNodeProps {
  workspace: WorkspaceInfo;
  sessions: SeroSessionInfo[];
}

export const WorkspaceNode = memo(function WorkspaceNode({ workspace, sessions }: WorkspaceNodeProps) {
  const [remoteManagerOpen, setRemoteManagerOpen] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const toggleCollapsed = useWorkspaceStore((state) => state.toggleCollapsed);
  const isActive = useWorkspaceStore(
    (state) => state.activeWorkspaceId === workspace.id,
  );
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);
  const closeWorkspace = useWorkspaceStore((state) => state.closeWorkspace);
  const deleteWorkspace = useWorkspaceStore((state) => state.deleteWorkspace);
  const createSession = useSessionStore((state) => state.createSession);
  const deleteSelectedSessions = useSessionStore((state) => state.deleteSelectedSessions);
  const clearSelection = useSessionStore((state) => state.clearSelection);
  const selectedInWorkspace = useSessionStore((state) => (
    sessions.reduce(
      (count, session) => count + (state.selectedSessionIds.has(session.id) ? 1 : 0),
      0,
    )
  ));

  const mountCount = workspace.references.length + workspace.mounts.length;
  const expanded = workspace.open;
  const isDefault = workspace.id === 'global';

  const handleHeaderClick = () => {
    toggleCollapsed(workspace.id);
    setActiveWorkspace(workspace.id);
  };

  const handleNewSession = async (event: React.MouseEvent | React.KeyboardEvent) => {
    event.stopPropagation();
    await createSession(workspace.id);
    setActiveWorkspace(workspace.id);
  };

  const handleClose = () => {
    void closeWorkspace(workspace.id);
  };

  const handleDelete = () => {
    void deleteWorkspace(workspace.id);
  };

  const handleBulkDelete = async () => {
    setConfirmBulkDelete(false);
    await deleteSelectedSessions(workspace.id);
  };

  return (
    <div className="py-1.5">
      <button type="button"
        data-testid={`workspace-node-${workspace.id}`}
        onClick={handleHeaderClick}
        className={cn(
          'group relative mb-1 flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left transition-colors',
          isActive
            ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]',
        )}
      >
        {expanded ? (
          <ChevronDown
            className={cn(
              'size-3 shrink-0 transition-colors',
              isActive
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]',
            )}
          />
        ) : (
          <ChevronRight
            className={cn(
              'size-3 shrink-0 transition-colors',
              isActive
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]',
            )}
          />
        )}
        {expanded ? (
          <FolderOpen className="size-4 shrink-0 fill-[var(--accent-primary)]/25 text-[var(--accent-primary)] transition-colors" />
        ) : (
          <Folder className="size-4 shrink-0 fill-[var(--accent-primary)]/25 text-[var(--accent-primary)] transition-colors" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {workspace.name}
        </span>
        <ContainerIndicator workspaceId={workspace.id} containerEnabled={workspace.container} />
        {mountCount > 0 && (
          <span
            className="flex size-3.5 items-center justify-center rounded-full bg-[var(--bg-base)] text-xs font-bold text-[var(--text-muted)]"
            title={`${mountCount} mount${mountCount > 1 ? 's' : ''}`}
          >
            {mountCount}
          </span>
        )}

        <span className="relative ml-auto flex h-5 shrink-0 items-center justify-end">
          {selectedInWorkspace > 0 ? (
            <span className="flex items-center gap-1">
              <span className="text-xs font-medium text-[var(--accent-primary)]">
                {selectedInWorkspace}
              </span>
              <IconAction
                as="span"
                role="button"
                tabIndex={-1}
                tone="destructive"
                onClick={(event) => {
                  event.stopPropagation();
                  setConfirmBulkDelete(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.stopPropagation();
                    setConfirmBulkDelete(true);
                  }
                }}
                title={`Delete ${selectedInWorkspace} selected session${selectedInWorkspace > 1 ? 's' : ''}`}
              >
                <Trash2 className="size-3" />
              </IconAction>
              <span
                role="button"
                tabIndex={-1}
                onClick={(event) => {
                  event.stopPropagation();
                  clearSelection();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.stopPropagation();
                    clearSelection();
                  }
                }}
                className="rounded p-0.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-base)] hover:text-[var(--text-primary)]"
                title="Clear selection (Esc)"
              >
                <X className="size-3" />
              </span>
            </span>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key="actions"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-0.5"
              >
                <IconAction
                  as="span"
                  role="button"
                  tabIndex={-1}
                  onClick={handleNewSession}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void handleNewSession(event);
                    }
                  }}
                  title="New session"
                >
                  <Plus className="size-3" />
                </IconAction>
                <RuntimePickerMenu workspace={workspace} />
                {workspace.runtime.backend !== 'host' && <WorkspaceReferencesMenu workspace={workspace} />}
                <IconAction
                  as="span"
                  role="button"
                  tabIndex={-1}
                  onClick={(event) => {
                    event.stopPropagation();
                    setRemoteManagerOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.stopPropagation();
                      setRemoteManagerOpen(true);
                    }
                  }}
                  title="Git repository"
                >
                  <GitBranch className="size-3" />
                </IconAction>
                {!isDefault && (
                  <WorkspaceCloseMenu
                    workspaceName={workspace.name}
                    workspacePath={workspace.path}
                    onClose={handleClose}
                    onDelete={handleDelete}
                  />
                )}
              </motion.span>
            </AnimatePresence>
          )}
        </span>
      </button>

      {expanded && (
        <div className="ml-2 flex flex-col gap-1 pl-2">
          {sessions.length === 0 ? (
            <span className="px-2 py-1 text-xs text-[var(--text-muted)]">
              No sessions
            </span>
          ) : (
            sessions.map((session) => (
              <SessionNode key={session.id} session={session} workspaceSessions={sessions} />
            ))
          )}
        </div>
      )}

      <WorkspaceBulkDeleteDialog
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        workspaceName={workspace.name}
        selectedCount={selectedInWorkspace}
        onConfirm={handleBulkDelete}
      />

      <RemoteOriginManager
        open={remoteManagerOpen}
        onOpenChange={setRemoteManagerOpen}
        workspace={workspace}
      />
    </div>
  );
});
