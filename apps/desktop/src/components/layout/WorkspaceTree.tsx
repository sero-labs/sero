import { useEffect, useState } from 'react';
import {
  Box,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  FolderPlus,
  Loader2,
  Minus,
  Monitor,
  Plus,
  Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useWorkspaceStore, useOpenWorkspaces } from '@/stores/workspace';
import { useSessionStore, useSessionsByWorkspace } from '@/stores/sessions';
import { useStreamingSessionIds } from '@/stores/agent';
import { useWorkspaceContainer, type ContainerStatus } from '@/stores/container';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { WorkspaceInfo, SeroSessionInfo } from '@/types/ipc';
import { cn } from '@/lib/utils';

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
  const addFolder = useWorkspaceStore((s) => s.addFolder);

  // Load on mount
  useEffect(() => {
    loadWorkspaces();
    loadSessions();
  }, [loadWorkspaces, loadSessions]);

  const handleAddFolder = async () => {
    try {
      const folderPath = await window.sero.workspace.pickFolder();
      if (!folderPath) return; // User cancelled

      await addFolder(folderPath);
      await loadSessions(); // Refresh sessions for the new workspace
    } catch (err) {
      console.error('Failed to add folder:', err);
    }
  };

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
        <button
          onClick={handleAddFolder}
          className="rounded-md p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
          title="Add workspace folder"
        >
          <FolderPlus className="size-3.5" />
        </button>
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

// ── Workspace node ─────────────────────────────────────────────

/** Tiny container/host status indicator dot. */
function ContainerIndicator({ workspaceId, containerEnabled }: { workspaceId: string; containerEnabled: boolean }) {
  const container = useWorkspaceContainer(workspaceId);

  // Host mode: no container indicator needed, status is always local
  if (!containerEnabled) return null;

  if (container.status === 'none') return null;

  const config: Record<ContainerStatus, { color: string; title: string; animate?: boolean }> = {
    none: { color: '', title: '' },
    starting: { color: 'bg-yellow-500', title: 'Container starting…', animate: true },
    running: { color: 'bg-emerald-500', title: container.ipAddress ? `Container running (${container.ipAddress})` : 'Container running' },
    stopped: { color: 'bg-zinc-500', title: 'Container stopped' },
    error: { color: 'bg-red-500', title: container.error ? `Container error: ${container.error}` : 'Container error' },
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
  const collapsedIds = useWorkspaceStore((s) => s.collapsedIds);
  const toggleCollapsed = useWorkspaceStore((s) => s.toggleCollapsed);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const closeWorkspace = useWorkspaceStore((s) => s.closeWorkspace);
  const removeWorkspace = useWorkspaceStore((s) => s.removeWorkspace);
  const toggleContainer = useWorkspaceStore((s) => s.toggleContainer);
  const createSession = useSessionStore((s) => s.createSession);
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const streamingIds = useStreamingSessionIds();

  const expanded = !collapsedIds.includes(workspace.id);
  const isActive = activeWorkspaceId === workspace.id;
  const hasStreaming = sessions.some((s) => streamingIds.includes(s.id));
  const isDefault = workspace.id === 'global';

  const handleHeaderClick = () => {
    toggleCollapsed(workspace.id);
    setActiveWorkspace(workspace.id);
  };

  const handleNewSession = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await createSession(workspace.id);
    setActiveWorkspace(workspace.id);
  };

  const handleToggleContainer = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await toggleContainer(workspace.id);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    closeWorkspace(workspace.id);
  };

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Remove workspace "${workspace.name}"?\n\nThis will unregister it from Sero. The folder and its files will not be deleted.`)) {
      return;
    }
    await removeWorkspace(workspace.id);
    await loadSessions();
  };

  return (
    <div>
      {/* Workspace header */}
      <button
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

        {/* Right side: crossfade between count and actions */}
        <span className="relative ml-auto flex h-5 shrink-0 items-center justify-end">
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
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleNewSession(e as unknown as React.MouseEvent); } }}
                  className="rounded p-0.5 hover:bg-[var(--bg-base)]"
                  title="New session"
                >
                  <Plus className="size-3 text-[var(--text-muted)]" />
                </span>
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={handleToggleContainer}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleToggleContainer(e as unknown as React.MouseEvent); } }}
                  className="rounded p-0.5 hover:bg-[var(--bg-base)]"
                  title={workspace.container ? 'Disable container (use host)' : 'Enable container'}
                >
                  {workspace.container ? (
                    <Box className="size-3 text-[var(--text-muted)]" />
                  ) : (
                    <Monitor className="size-3 text-[var(--text-muted)]" />
                  )}
                </span>
                {!isDefault && (
                  <>
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={handleClose}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleClose(e as unknown as React.MouseEvent); } }}
                      className="rounded p-0.5 hover:bg-[var(--bg-base)]"
                      title="Close workspace"
                    >
                      <Minus className="size-3 text-[var(--text-muted)]" />
                    </span>
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={handleRemove}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleRemove(e as unknown as React.MouseEvent); } }}
                      className="rounded p-0.5 hover:bg-[var(--bg-base)]"
                      title="Remove workspace"
                    >
                      <Trash2 className="size-3 text-[var(--text-muted)]" />
                    </span>
                  </>
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
                  <span className="size-2 shrink-0 animate-pulse rounded-full bg-emerald-500" />
                )}
                {sessions.length > 0 && !expanded && (
                  <span className="text-xs text-[var(--text-muted)]">
                    {sessions.length}
                  </span>
                )}
              </motion.span>
            )}
          </AnimatePresence>
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
              <SessionNode key={session.id} session={session} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Session node ───────────────────────────────────────────────

function SessionNode({ session }: { session: SeroSessionInfo }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const deleteSession = useSessionStore((s) => s.deleteSession);
  const streamingIds = useStreamingSessionIds();

  const isActive = activeSessionId === session.id;
  const isStreaming = streamingIds.includes(session.id);

  const title = session.name || session.firstMessage || 'New chat';
  const modified = formatRelativeDate(session.modified);

  const handleDelete = async () => {
    setConfirmOpen(false);
    await deleteSession(session.path);
  };

  return (
    <button
      onClick={() => setActiveSession(session.id)}
      className={cn(
        'group flex w-full items-center gap-4 rounded-md px-2 py-1 text-left transition-colors',
        isActive
          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
          : 'hover:bg-[var(--bg-elevated)]',
      )}
    >
      {/* Streaming spinner — only visible when agent is working */}
      <span className="flex size-3 shrink-0 items-center justify-center">
        {isStreaming && (
          <Loader2 className="size-3 animate-spin text-emerald-500" />
        )}
      </span>

      {/* Title + metadata */}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-[var(--text-primary)]">
          {title}
        </span>
        <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
          <span>{modified}</span>
          {session.messageCount > 0 && (
            <>
              <span>·</span>
              <span>{session.messageCount} msg{session.messageCount !== 1 ? 's' : ''}</span>
            </>
          )}
        </div>
      </div>

      {/* Delete with confirmation popover */}
      <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
        <PopoverTrigger asChild>
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); setConfirmOpen(true); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setConfirmOpen(true); } }}
            className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-[var(--bg-base)] group-hover:opacity-100"
            title="Delete session"
          >
            <Trash2 className="size-3 text-[var(--text-muted)]" />
          </span>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="right"
          className="w-52 p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-3 text-xs text-[var(--text-secondary)]">
            Delete this session?
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-sm"
              onClick={(e) => { e.stopPropagation(); setConfirmOpen(false); }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-6 px-2 text-sm"
              onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            >
              Delete
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </button>
  );
}

// ── Helpers ────────────────────────────────────────────────────

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
