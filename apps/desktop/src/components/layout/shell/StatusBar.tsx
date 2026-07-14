import { useState, useEffect, useCallback, useRef } from 'react';
import { FolderOpen, Bug, Sun, Moon, Monitor, GitBranch, Palette } from 'lucide-react';
import { useAppStore } from '@/stores/app';
import { useThemeStore } from '@/stores/theme';
import { MAX_ZOOM, MIN_ZOOM, useZoomStore } from '@/stores/zoom';
import { useActiveWorkspace } from '@/stores/workspace';
import { DevServerIndicator } from '@/components/layout/DevServerPanel';
import { useWorkspaceVcs, useVcsStore } from '@/stores/vcs';
import type { Bookmark } from '@sero-ai/common';

/**
 * StatusBar, bottom bar showing workspace info (à la VSCode).
 *
 * Left side: active workspace name + path.
 * Right side: debug toggle, active agent count, zoom, version, theme.
 */
export function StatusBar() {
  const theme = useAppStore((s) => s.theme);
  const themeMode = useThemeStore((s) => s.mode);
  const toggleMode = useThemeStore((s) => s.toggleMode);
  const activeWorkspace = useActiveWorkspace();
  const vcsState = useWorkspaceVcs(activeWorkspace?.id ?? null);

  return (
    <footer className="chrome-zoom-invariant flex h-6 shrink-0 items-center justify-between border-t border-[var(--border-default)] bg-[var(--bg-base)] px-3 text-base text-[var(--text-muted)]">
      {/* ── Left ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {activeWorkspace && (
          <span className="flex items-center gap-1">
            <FolderOpen className="size-3" />
            {activeWorkspace.name}
          </span>
        )}
        {activeWorkspace && (
          <button type="button"
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
        <ZoomControl />
        <span>Sero v0.1.0</span>
        <button type="button"
          onClick={toggleMode}
          title={`Theme mode: ${themeMode} (click to cycle)`}
          className="flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors"
        >
          {themeMode === 'dark' ? <Moon className="size-3" /> : themeMode === 'light' ? <Sun className="size-3" /> : <Monitor className="size-3" />}
          <span className="capitalize">{themeMode}</span>
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
      <button type="button"
        onClick={() => setOpen((v) => !v)}
        title="Active push branch (click to change)"
        className="flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors"
      >
        <GitBranch className="size-3" />
        <span className="rounded-sm border border-[var(--brand-primary-border)] bg-[var(--brand-primary-muted)] px-1 py-px font-mono text-xs text-[var(--brand-primary)]">
          {activePushBookmark ?? 'auto'}
        </span>
      </button>

      {open && (
        <div className="absolute bottom-6 right-0 z-50 min-w-[180px] rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] p-1 shadow-lg">
          <button type="button"
            onClick={() => {
              setActivePushBookmark(workspaceId, null);
              setOpen(false);
            }}
            className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-[var(--bg-muted)]"
          >
            <span>Auto (main/first)</span>
            {!activePushBookmark && <span className="text-[var(--brand-primary)]">active</span>}
          </button>
          {bookmarks.map((bm) => (
            <button type="button"
              key={bm.name}
              onClick={() => {
                setActivePushBookmark(workspaceId, bm.name);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-[var(--bg-muted)]"
            >
              <span className="truncate">{bm.name}</span>
              {activePushBookmark === bm.name && <span className="text-[var(--brand-primary)]">active</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Zoom control ──────────────────────────────────────────────

function ZoomControl() {
  const factor = useZoomStore((s) => s.factor);
  const zoomIn = useZoomStore((s) => s.zoomIn);
  const zoomOut = useZoomStore((s) => s.zoomOut);
  const resetZoom = useZoomStore((s) => s.resetZoom);

  return (
    <div className="flex items-center">
      <button type="button"
        onClick={zoomOut}
        disabled={factor <= MIN_ZOOM}
        title="Zoom out (⌘−)"
        aria-label="Zoom out"
        className="rounded px-1 hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
      >
        −
      </button>
      <button type="button"
        onClick={resetZoom}
        title="Reset zoom (⌘0)"
        className="min-w-[42px] rounded px-1 text-center text-xs tabular-nums hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors"
      >
        {Math.round(factor * 100)}%
      </button>
      <button type="button"
        onClick={zoomIn}
        disabled={factor >= MAX_ZOOM}
        title="Zoom in (⌘+)"
        aria-label="Zoom in"
        className="rounded px-1 hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
      >
        +
      </button>
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
    <button type="button"
      onClick={toggle}
      onContextMenu={openLog}
      title={
        enabled
          ? 'SDK logging ON, click to disable, right-click to reveal log'
          : 'SDK logging OFF, click to enable'
      }
      className={`flex items-center gap-1 transition-colors ${
        enabled
          ? 'text-status-warning hover:text-status-warning/80'
          : 'hover:text-[var(--text-primary)]'
      }`}
    >
      <Bug className="size-3" />
      {enabled && <span className="text-xs">logging</span>}
    </button>
  );
}
