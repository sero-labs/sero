import { useState, useEffect, useCallback } from 'react';
import { FolderOpen, Bot, Bug, Sun, Moon } from 'lucide-react';
import { useAppStore } from '@/stores/app';
import { useActiveWorkspace } from '@/stores/workspace';
import { useActiveAgentCount } from '@/stores/agent';
import { DevServerIndicator } from './DevServerPanel';

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
  const agentCount = useActiveAgentCount();

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
        {agentCount > 0 && (
          <span className="flex items-center gap-1">
            <Bot className="size-3" />
            {agentCount} active
          </span>
        )}
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
