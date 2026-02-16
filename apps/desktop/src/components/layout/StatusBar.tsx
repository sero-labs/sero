import { FolderOpen, Bot } from 'lucide-react';
import { useAppStore } from '@/stores/app';
import { useActiveWorkspace } from '@/stores/workspace';
import { useActiveAgentCount } from '@/stores/agent';
import { DevServerIndicator } from './DevServerPanel';

/**
 * StatusBar — bottom bar showing workspace info (à la VSCode).
 *
 * Left side: active workspace name + path.
 * Right side: active agent count, version, theme.
 */
export function StatusBar() {
  const theme = useAppStore((s) => s.theme);
  const activeWorkspace = useActiveWorkspace();
  const agentCount = useActiveAgentCount();

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-border/50 bg-[var(--bg-base)] px-3 text-sm text-[var(--text-muted)]">
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
        <DevServerIndicator />
        {agentCount > 0 && (
          <span className="flex items-center gap-1">
            <Bot className="size-3" />
            {agentCount} active
          </span>
        )}
        <span>Sero v0.1.0</span>
        <span className="capitalize">{theme}</span>
      </div>
    </footer>
  );
}
