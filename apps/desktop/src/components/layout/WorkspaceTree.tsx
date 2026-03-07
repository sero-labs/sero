import { useEffect, useRef, useState } from 'react';
import {
  Box,
  ChevronDown,
  ChevronRight,
  FolderOpen,
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
import { useWorkspaceContainer, type ContainerStatus } from '@/stores/container';
import { Button } from '@sero/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sero/ui/components/ui/popover';
import type { WorkspaceInfo, SeroSessionInfo } from '@/types/ipc';
import { cn } from '@sero/ui/lib/utils';
import { SessionNode } from './SessionNode';
import { PickView, CreateView } from './AddWorkspaceViews';

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

  // Load on mount
  useEffect(() => {
    loadWorkspaces();
    loadSessions();
  }, [loadWorkspaces, loadSessions]);

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
  useEffect(() => {
    const handleOpenSession = async (e: Event) => {
      const { sessionId, sessionPath, workspaceId } =
        (e as CustomEvent<{ sessionId: string | null; sessionPath: string | null; workspaceId: string }>).detail;

      // Open the workspace in the sidebar first
      await window.sero.workspace.open(workspaceId).catch(() => {});

      if (sessionId && sessionPath) {
        // Ensure the agent session is loaded in the pool
        await window.sero.agent.open(sessionId, sessionPath, workspaceId).catch(() => {});
        setActiveSession(sessionId);
      }

      // Expand the chat panel so the user can see the session
      setChatPanelOpen(true);
    };
    window.addEventListener('sero:open-session', handleOpenSession);
    return () => window.removeEventListener('sero:open-session', handleOpenSession);
  }, [setActiveSession, setChatPanelOpen]);

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
        <AddWorkspaceMenu />
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

// ── Add Workspace menu ─────────────────────────────────────────

type AddView = 'pick' | 'create';

function AddWorkspaceMenu() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<AddView>('pick');
  const [newName, setNewName] = useState('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Guards against Radix auto-closing the popover when a native dialog steals focus
  const pickingFolderRef = useRef(false);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const addFolder = useWorkspaceStore((s) => s.addFolder);
  const loadSessions = useSessionStore((s) => s.loadSessions);

  const reset = () => { setView('pick'); setNewName(''); setParentPath(null); };

  const handleImportExisting = async () => {
    setOpen(false);
    pickingFolderRef.current = true;
    try {
      const folderPath = await window.sero.workspace.pickFolder();
      if (!folderPath) return;
      await addFolder(folderPath);
      await loadSessions();
    } catch (err) {
      console.error('Failed to import workspace:', err);
    } finally {
      pickingFolderRef.current = false;
    }
  };

  const handlePickLocation = async () => {
    pickingFolderRef.current = true;
    try {
      const picked = await window.sero.workspace.pickFolder();
      if (picked) setParentPath(picked);
    } finally {
      pickingFolderRef.current = false;
    }
  };

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed || isCreating) return;
    setIsCreating(true);
    try {
      await createWorkspace(trimmed, parentPath ?? undefined);
      await loadSessions();
      setOpen(false);
    } catch (err) {
      console.error('Failed to create workspace:', err);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => {
      if (!o && pickingFolderRef.current) return; // Native dialog stole focus — don't close
      setOpen(o);
      if (!o) reset();
    }}>
      <PopoverTrigger asChild>
        <button
          className="rounded-md p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
          title="Add workspace"
        >
          <Plus className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        className="w-64 p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {view === 'pick' ? (
          <PickView
            onCreateNew={() => {
              setView('create');
              // Focus the input after the view transition renders
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            onImportExisting={handleImportExisting}
          />
        ) : (
          <CreateView
            inputRef={inputRef}
            name={newName}
            onNameChange={setNewName}
            parentPath={parentPath}
            onPickLocation={handlePickLocation}
            onClearLocation={() => setParentPath(null)}
            onBack={() => { setView('pick'); setNewName(''); setParentPath(null); }}
            onCreate={handleCreate}
            isCreating={isCreating}
          />
        )}
      </PopoverContent>
    </Popover>
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

