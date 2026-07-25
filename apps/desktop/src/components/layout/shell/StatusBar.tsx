import { useState, useEffect, useCallback } from 'react';
import { FolderOpen, Bug, Sun, Moon, Monitor } from 'lucide-react';
import { useThemeStore } from '@/stores/theme';
import { MAX_ZOOM, MIN_ZOOM, useZoomStore } from '@/stores/zoom';
import { useActiveWorkspace } from '@/stores/workspace';
import { DevServerIndicator } from '@/components/layout/DevServerPanel';

/**
 * StatusBar, bottom bar showing workspace info (à la VSCode).
 *
 * Left side: active workspace name + path.
 * Right side: debug toggle, active agent count, zoom, version, theme.
 *
 * No git affordance: git lives in the Git app and the titlebar popover (AD-025 —
 * `docs/features/git-ux.md`). The status bar reads no git state.
 */
export function StatusBar() {
  const themeMode = useThemeStore((s) => s.mode);
  const toggleMode = useThemeStore((s) => s.toggleMode);
  const activeWorkspace = useActiveWorkspace();

  return (
    <footer className="chrome-zoom-invariant flex h-6 shrink-0 items-center justify-between border-t border-[var(--border-default)] bg-[var(--bg-base)] px-3 text-xs text-[var(--text-muted)]">
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
            className="max-w-[500px] truncate hover:text-[var(--text-primary)] transition-colors"
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
        className="min-w-[42px] rounded px-1 text-center tabular-nums hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors"
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
      {enabled && <span>logging</span>}
    </button>
  );
}
