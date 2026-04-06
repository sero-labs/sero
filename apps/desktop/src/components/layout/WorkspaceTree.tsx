import { useEffect, useState } from 'react';
import {
  Box,
  ChevronsDownUp,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  GitBranch,
  Loader2,
  Minus,
  Monitor,
  Plus,
  Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useWorkspaceStore, useOpenWorkspaces } from '@/stores/workspace';
import { useSessionStore, useSessionsByWorkspace } from '@/stores/sessions';
import { useStreamingSessionIds } from '@/stores/agent-selectors';
import { useAppStore } from '@/stores/app';
import { useAgentStore } from '@/stores/agent';
import { useWorkspaceContainer, type ContainerStatus } from '@/stores/container';
import { Button } from '@sero-ai/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@sero-ai/ui/components/ui/dialog';

import type { WorkspaceInfo, SeroSessionInfo } from '@/types/ipc';
import { cn } from '@sero-ai/ui/lib/utils';
import { SessionNode } from './SessionNode';
import { AddWorkspaceMenu } from './AddWorkspaceMenu';
import { WorkspaceReferencesMenu } from './WorkspaceReferencesMenu';
import { RemoteOriginManager } from './RemoteOriginManager';

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
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const openWorkspaces = useOpenWorkspaces();
  const sessionsByWorkspace = useSessionsByWorkspace();
  const isLoadingWorkspaces = useWorkspaceStore((s) => s.isLoading);
  const clearSelection = useSessionStore((s) => s.clearSelection);
  const hasSelection = useSessionStore((s) => s.selectedSessionIds.size > 0);

  // Load on mount
  useEffect(() => {
    loadWorkspaces();
    loadSessions();
  }, [loadWorkspaces, loadSessions]);

  // Escape key clears multi-select
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && hasSelection && !e.defaultPrevented) {
        clearSelection();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection, hasSelection]);

  // Refresh when a federated app (e.g. SlopZilla) creates a workspace
  useEffect(() => {
    const refresh = () => {
      loadWorkspaces();
      loadSessions();
    };
    window.addEventListener('sero:workspace-changed', refresh);
    return () => window.removeEventListener('sero:workspace-changed', refresh);
  }, [loadWorkspaces, loadSessions]);

  // Open a session in the ChatPanel when a federated app dispatches sero:open-session
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const setChatPanelOpen = useAppStore((s) => s.setChatPanelOpen);
  const openSession = useAgentStore((s) => s.openSession);
  useEffect(() => {
    const handleOpenSession = async (e: Event) => {
      const { sessionId, sessionPath, workspaceId } =
        (e as CustomEvent<{ sessionId: string | null; sessionPath: string | null; workspaceId: string }>).detail;

      // Open the workspace in the sidebar first
      await window.sero.workspace.open(workspaceId).catch(() => {});

      if (sessionId && sessionPath) {
        // Route through the agent store so concurrent callers share the same
        // open promise and the focused session state stays consistent.
        await openSession(sessionId, sessionPath, workspaceId);
        setActiveSession(sessionId);
      }

      // Expand the chat panel so the user can see the session
      setChatPanelOpen(true);
    };
    window.addEventListener('sero:open-session', handleOpenSession);
    return () => window.removeEventListener('sero:open-session', handleOpenSession);
  }, [openSession, setActiveSession, setChatPanelOpen]);

  if (isLoadingWorkspaces) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-4 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Workspaces
        </span>
        <div className="flex items-center gap-0.5">
          <CollapseAllButton />
          <AddWorkspaceMenu />
        </div>
      </div>

      {/* Tree */}
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

// ── Collapse All button ────────────────────────────────────────

function CollapseAllButton() {
  const collapseAll = useWorkspaceStore((s) => s.collapseAll);
  const hasExpanded = useWorkspaceStore((s) => s.workspaces.some((w) => w.open));

  if (!hasExpanded) return null;

  return (
    <button
      onClick={collapseAll}
      className="rounded-md p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
      title="Collapse all"
    >
      <ChevronsDownUp className="size-3.5" />
    </button>
  );
}

// ── Workspace node ─────────────────────────────────────────────

/** Tiny container/host status indicator dot. */
function ContainerIndicator({ workspaceId, containerEnabled }: { workspaceId: string; containerEnabled: boolean }) {
  const container = useWorkspaceContainer(workspaceId);

  // Host mode: no container indicator needed, status is always local
  if (!containerEnabled) return null;

  if (container.status === 'none') return null;

  const config: Record<ContainerStatus, { color: string; title: string; animate?: boolean }> = {
    none: { color: '', title: '' },
    starting: { color: 'bg-[var(--status-warning)]', title: 'Container starting…', animate: true },
    running: { color: 'bg-[var(--status-success)]', title: container.ipAddress ? `Container running (${container.ipAddress})` : 'Container running' },
    stopped: { color: 'bg-zinc-500', title: 'Container stopped' },
    error: { color: 'bg-[var(--status-error)]', title: container.error ? `Container error: ${container.error}` : 'Container error' },
  };

  const { color, title, animate } = config[container.status];

  return (
    <span
      className={cn('size-1.5 shrink-0 rounded-full', color, animate && 'animate-pulse')}
      title={title}
    />
  );
}

function WorkspaceNode({
  workspace,
  sessions,
}: {
  workspace: WorkspaceInfo;
  sessions: SeroSessionInfo[];
}) {
  const [hovered, setHovered] = useState(false);
  const [remoteManagerOpen, setRemoteManagerOpen] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const toggleCollapsed = useWorkspaceStore((s) => s.toggleCollapsed);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const closeWorkspace = useWorkspaceStore((s) => s.closeWorkspace);
  const toggleContainer = useWorkspaceStore((s) => s.toggleContainer);
  const createSession = useSessionStore((s) => s.createSession);
  const deleteSelectedSessions = useSessionStore((s) => s.deleteSelectedSessions);
  const clearSelection = useSessionStore((s) => s.clearSelection);
  const selectedSessionIds = useSessionStore((s) => s.selectedSessionIds);
  const streamingIds = useStreamingSessionIds();

  // Count how many selected sessions belong to this workspace
  const selectedInWorkspace = sessions.filter((s) => selectedSessionIds.has(s.id)).length;

  const expanded = workspace.open;
  const isActive = activeWorkspaceId === workspace.id;
  const hasStreaming = sessions.some((s) => streamingIds.includes(s.id));
  const isDefault = workspace.id === 'global';

  const handleHeaderClick = () => {
    toggleCollapsed(workspace.id);
    setActiveWorkspace(workspace.id);
  };

  const handleNewSession = async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    await createSession(workspace.id);
    setActiveWorkspace(workspace.id);
  };

  const handleToggleContainer = async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    await toggleContainer(workspace.id);
  };

  const handleClose = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    closeWorkspace(workspace.id);
  };

  const handleBulkDelete = async () => {
    setConfirmBulkDelete(false);
    await deleteSelectedSessions(workspace.id);
  };

  return (
    <div>
      {/* Workspace header */}
      <button
        data-testid={`workspace-node-${workspace.id}`}
        onClick={handleHeaderClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          'relative flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left transition-colors',
          isActive
            ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]',
        )}
      >
        {expanded ? (
          <ChevronDown className="size-3 shrink-0 text-[var(--text-muted)]" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-[var(--text-muted)]" />
        )}
        <FolderOpen className="size-3.5 shrink-0 text-[var(--text-muted)]" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {workspace.name}
        </span>
        <ContainerIndicator workspaceId={workspace.id} containerEnabled={workspace.container} />
        {(workspace.references.length + workspace.mounts.length) > 0 && (
          <span
            className="flex size-3.5 items-center justify-center rounded-full bg-[var(--bg-base)] text-[8px] font-bold text-[var(--text-muted)]"
            title={`${workspace.references.length + workspace.mounts.length} mount${workspace.references.length + workspace.mounts.length > 1 ? 's' : ''}`}
          >
            {workspace.references.length + workspace.mounts.length}
          </span>
        )}

        {/* Right side: crossfade between count and actions */}
        <span className="relative ml-auto flex h-5 shrink-0 items-center justify-end">
          {/* Bulk delete badge — always visible when sessions are selected in this workspace */}
          {selectedInWorkspace > 0 ? (
            <span className="flex items-center gap-1">
              <span className="text-xs font-medium text-[var(--accent-primary)]">
                {selectedInWorkspace}
              </span>
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => { e.stopPropagation(); setConfirmBulkDelete(true); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setConfirmBulkDelete(true); } }}
                className="rounded p-0.5 hover:bg-[var(--status-error)]/15"
                title={`Delete ${selectedInWorkspace} selected session${selectedInWorkspace > 1 ? 's' : ''}`}
              >
                <Trash2 className="size-3 text-[var(--status-error)]" />
              </span>
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => { e.stopPropagation(); clearSelection(); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); clearSelection(); } }}
                className="rounded p-0.5 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-base)] hover:text-[var(--text-primary)]"
                title="Clear selection (Esc)"
              >
                ✕
              </span>
            </span>
          ) : (
          <AnimatePresence mode="wait" initial={false}>
            {hovered ? (
              <motion.span
                key="actions"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-0.5"
              >
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={handleNewSession}
                  onKeyDown={(e) => { if (e.key === 'Enter') { handleNewSession(e); } }}
                  className="rounded p-0.5 hover:bg-[var(--bg-base)]"
                  title="New session"
                >
                  <Plus className="size-3 text-[var(--text-muted)]" />
                </span>
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={handleToggleContainer}
                  onKeyDown={(e) => { if (e.key === 'Enter') { handleToggleContainer(e); } }}
                  className="rounded p-0.5 hover:bg-[var(--bg-base)]"
                  title={workspace.container ? 'Disable container (use host)' : 'Enable container'}
                >
                  {workspace.container ? (
                    <Box className="size-3 text-[var(--text-muted)]" />
                  ) : (
                    <Monitor className="size-3 text-[var(--text-muted)]" />
                  )}
                </span>
                {workspace.container && (
                  <WorkspaceReferencesMenu workspace={workspace} />
                )}
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => { e.stopPropagation(); setRemoteManagerOpen(true); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setRemoteManagerOpen(true); } }}
                  className="rounded p-0.5 hover:bg-[var(--bg-base)]"
                  title="Remote origin"
                >
                  <GitBranch className="size-3 text-[var(--text-muted)]" />
                </span>
                {!isDefault && (
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={handleClose}
                    onKeyDown={(e) => { if (e.key === 'Enter') { handleClose(e); } }}
                    className="rounded p-0.5 hover:bg-[var(--bg-base)]"
                    title="Close workspace"
                  >
                    <Minus className="size-3 text-[var(--text-muted)]" />
                  </span>
                )}
              </motion.span>
            ) : (
              <motion.span
                key="count"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-1 pr-0.5"
              >
                {hasStreaming && (
                  <span className="size-2 shrink-0 animate-pulse rounded-full bg-[var(--status-success)]" />
                )}
                {sessions.length > 0 && !expanded && (
                  <span className="text-xs text-[var(--text-muted)]">
                    {sessions.length}
                  </span>
                )}
              </motion.span>
            )}
          </AnimatePresence>
          )}
        </span>
      </button>

      {/* Sessions */}
      {expanded && (
        <div className="ml-2 flex flex-col gap-0.5 pl-2 border-l border-[var(--border-subtle)]">
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

      {/* Bulk delete confirmation */}
      <Dialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {selectedInWorkspace} session{selectedInWorkspace > 1 ? 's' : ''}?</DialogTitle>
            <DialogDescription>
              This will permanently delete {selectedInWorkspace === 1 ? 'this session' : `these ${selectedInWorkspace} sessions`} from{' '}
              <span className="font-medium text-[var(--text-primary)]">{workspace.name}</span>.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirmBulkDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
              Delete {selectedInWorkspace} session{selectedInWorkspace > 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remote origin manager */}
      <RemoteOriginManager
        open={remoteManagerOpen}
        onOpenChange={setRemoteManagerOpen}
        workspace={workspace}
      />
    </div>
  );
}
