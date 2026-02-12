import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  FolderPlus,
  Loader2,
  MessageSquare,
  Minus,
  Plus,
  Power,
  Trash2,
  X,
} from 'lucide-react';
import { useWorkspaceStore, useOpenWorkspaces } from '@/stores/workspace';
import { useSessionStore, useSessionsByWorkspace } from '@/stores/sessions';
import { useAgentStore, useStreamingSessionIds } from '@/stores/agent';
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
  const allWorkspaces = useWorkspaceStore((s) => s.workspaces);
  const openIds = useWorkspaceStore((s) => s.openWorkspaceIds);
  const openWorkspace = useWorkspaceStore((s) => s.openWorkspace);
  const sessionsByWorkspace = useSessionsByWorkspace();
  const isLoadingWorkspaces = useWorkspaceStore((s) => s.isLoading);
  const addFolder = useWorkspaceStore((s) => s.addFolder);

  const closedWorkspaces = allWorkspaces.filter((w) => !openIds.includes(w.id));

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
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
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
          <span className="px-2 py-4 text-center text-[11px] text-[var(--text-muted)]">
            No workspaces open
          </span>
        )}

        {/* Closed workspaces — quick re-open */}
        {closedWorkspaces.length > 0 && (
          <div className="mt-2 border-t border-border/30 pt-2">
            <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Closed
            </span>
            {closedWorkspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => openWorkspace(ws.id)}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
              >
                <FolderOpen className="size-3 shrink-0" />
                <span className="truncate">{ws.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Workspace node ─────────────────────────────────────────────

function WorkspaceNode({
  workspace,
  sessions,
}: {
  workspace: WorkspaceInfo;
  sessions: SeroSessionInfo[];
}) {
  const [expanded, setExpanded] = useState(true);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const closeWorkspace = useWorkspaceStore((s) => s.closeWorkspace);
  const removeWorkspace = useWorkspaceStore((s) => s.removeWorkspace);
  const createSession = useSessionStore((s) => s.createSession);
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const streamingIds = useStreamingSessionIds();

  const isActive = activeWorkspaceId === workspace.id;
  const hasStreaming = sessions.some((s) => streamingIds.includes(s.id));
  const isDefault = workspace.id === 'scratchpad' || workspace.id === 'global';

  const handleHeaderClick = () => {
    setExpanded(!expanded);
    setActiveWorkspace(workspace.id);
  };

  const handleNewSession = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await createSession(workspace.id);
    setActiveWorkspace(workspace.id);
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
        className={cn(
          'group flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left transition-colors',
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
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {workspace.name}
        </span>

        {/* Streaming indicator */}
        {hasStreaming && (
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-emerald-500" />
        )}

        {/* Session count */}
        {sessions.length > 0 && !expanded && (
          <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
            {sessions.length}
          </span>
        )}

        {/* Actions (visible on hover) */}
        <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
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
        </span>
      </button>

      {/* Sessions */}
      {expanded && (
        <div className="ml-2 flex flex-col gap-0.5 pl-2 border-l border-border/30">
          {sessions.length === 0 ? (
            <span className="px-2 py-1 text-[10px] text-[var(--text-muted)]">
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
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const deleteSession = useSessionStore((s) => s.deleteSession);
  const agents = useAgentStore((s) => s.agents);
  const closeSession = useAgentStore((s) => s.closeSession);
  const streamingIds = useStreamingSessionIds();

  const isActive = activeSessionId === session.id;
  const isInPool = !!agents[session.id];
  const isStreaming = streamingIds.includes(session.id);

  const title = session.name || session.firstMessage || 'New chat';
  const modified = formatRelativeDate(session.modified);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSession(session.path);
  };

  const handleCloseAgent = (e: React.MouseEvent) => {
    e.stopPropagation();
    closeSession(session.id);
  };

  return (
    <button
      onClick={() => setActiveSession(session.id)}
      className={cn(
        'group flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors',
        isActive
          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
          : 'hover:bg-[var(--bg-elevated)]',
      )}
    >
      {/* Status dot */}
      {isStreaming ? (
        <Loader2 className="size-3 shrink-0 animate-spin text-emerald-500" />
      ) : isInPool ? (
        <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
      ) : (
        <span className="size-1.5 shrink-0 rounded-full bg-[var(--text-muted)]/30" />
      )}

      {/* Title + metadata */}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[11px] font-medium text-[var(--text-primary)]">
          {title}
        </span>
        <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
          <span>{modified}</span>
          {session.messageCount > 0 && (
            <>
              <span>·</span>
              <span>{session.messageCount} msg{session.messageCount !== 1 ? 's' : ''}</span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {isInPool && !isStreaming && (
          <span
            role="button"
            tabIndex={-1}
            onClick={handleCloseAgent}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleCloseAgent(e as unknown as React.MouseEvent); } }}
            className="rounded p-0.5 hover:bg-[var(--bg-base)]"
            title="Close agent (keep session)"
          >
            <Power className="size-3 text-[var(--text-muted)]" />
          </span>
        )}
        <span
          role="button"
          tabIndex={-1}
          onClick={handleDelete}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleDelete(e as unknown as React.MouseEvent); } }}
          className="rounded p-0.5 hover:bg-[var(--bg-base)]"
          title="Delete session"
        >
          <Trash2 className="size-3 text-[var(--text-muted)]" />
        </span>
      </span>
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
