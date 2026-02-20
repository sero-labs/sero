import { useState, useEffect, useCallback, useRef } from 'react';
import { FolderOpen, Bug, Sun, Moon, GitBranch } from 'lucide-react';
import { useAppStore } from '@/stores/app';
import { useActiveWorkspace } from '@/stores/workspace';
import { DevServerIndicator } from './DevServerPanel';
import { useWorkspaceVcs, useVcsStore } from '@/stores/vcs';
import type { Bookmark } from '@/types/vcs';

/**
 * StatusBar — bottom bar showing workspace info (à la VSCode).
 *
 * Left side: active workspace name + path.
 * Right side: debug toggle, active agent count, version, theme.
 */
export function StatusBar() {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const activeWorkspace = useActiveWorkspace();
  const vcsState = useWorkspaceVcs(activeWorkspace?.id ?? null);

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-[var(--border-default)] bg-[var(--bg-base)] px-3 text-sm text-[var(--text-muted)]">
      {/* ── Left ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {activeWorkspace && (
          <span className="flex items-center gap-1">
            <FolderOpen className="size-3" />
            {activeWorkspace.name}
          </span>
        )}
        {activeWorkspace && (
          <button
            className="max-w-[300px] truncate text-xs hover:text-[var(--text-primary)] transition-colors"
            onClick={() => window.sero.shell.showItemInFolder(activeWorkspace.path)}
            title="Reveal in file explorer"
          >
            {activeWorkspace.path}
          </button>
        )}
      </div>

      {/* ── Right ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <DebugLogToggle />
        <DevServerIndicator />
        <ActivePushBranchPicker
          workspaceId={activeWorkspace?.id ?? null}
          activePushBookmark={vcsState?.activePushBookmark ?? null}
          bookmarks={vcsState?.bookmarks ?? []}
        />
        <span>Sero v0.1.0</span>
        <button
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          className="flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors"
        >
          {theme === 'dark' ? <Moon className="size-3" /> : <Sun className="size-3" />}
          <span className="capitalize">{theme}</span>
        </button>
      </div>
    </footer>
  );
}

function ActivePushBranchPicker({
  workspaceId,
  activePushBookmark,
  bookmarks,
}: {
  workspaceId: string | null;
  activePushBookmark: string | null;
  bookmarks: Bookmark[];
}) {
  const setActivePushBookmark = useVcsStore((s) => s.setActivePushBookmark);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (!rootRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  if (!workspaceId) return null;
  if (!activePushBookmark && bookmarks.length === 0) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Active push branch (click to change)"
        className="flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors"
      >
        <GitBranch className="size-3" />
        <span className="rounded-sm border border-blue-500/30 bg-blue-500/10 px-1 py-px font-mono text-xs text-blue-300">
          {activePushBookmark ?? 'auto'}
        </span>
      </button>

      {open && (
        <div className="absolute bottom-6 right-0 z-50 min-w-[180px] rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] p-1 shadow-lg">
          <button
            onClick={() => {
              setActivePushBookmark(workspaceId, null);
              setOpen(false);
            }}
            className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-[var(--bg-muted)]"
          >
            <span>Auto (main/first)</span>
            {!activePushBookmark && <span className="text-blue-300">active</span>}
          </button>
          {bookmarks.map((bm) => (
            <button
              key={bm.name}
              onClick={() => {
                setActivePushBookmark(workspaceId, bm.name);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-[var(--bg-muted)]"
            >
              <span className="truncate">{bm.name}</span>
              {activePushBookmark === bm.name && <span className="text-blue-300">active</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Debug log toggle ──────────────────────────────────────────

function DebugLogToggle() {
  const [enabled, setEnabled] = useState(false);

  // Hydrate from main process on mount + subscribe to changes
  useEffect(() => {
    window.sero.debug.getState().then(setEnabled).catch(() => {});
    const unsub = window.sero.debug.onStateChanged(setEnabled);
    return unsub;
  }, []);

  const toggle = useCallback(() => {
    window.sero.debug.toggle().then(setEnabled).catch(() => {});
  }, []);

  const openLog = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    window.sero.debug.openLog();
  }, []);

  return (
    <button
      onClick={toggle}
      onContextMenu={openLog}
      title={
        enabled
          ? 'SDK logging ON — click to disable, right-click to reveal log'
          : 'SDK logging OFF — click to enable'
      }
      className={`flex items-center gap-1 transition-colors ${
        enabled
          ? 'text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300'
          : 'hover:text-[var(--text-primary)]'
      }`}
    >
      <Bug className="size-3" />
      {enabled && <span className="text-xs">logging</span>}
    </button>
  );
}
