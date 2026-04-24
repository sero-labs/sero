import { useMemo } from 'react';
import { Files, GitBranch, Terminal, Network, Globe } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sero-ai/ui/components/ui/tooltip';
import { cn } from '@sero-ai/ui/lib/utils';
import { useSubagentStore } from '@/stores/subagent';

// ── Types ──────────────────────────────────────────────────────
export type ExplorerPanel = 'explorer' | 'git' | 'orchestration' | 'browser' | 'terminal';

interface ActivityItem {
  id: ExplorerPanel;
  label: string;
  icon: React.ReactNode;
  /** If true, this item is placed at the bottom of the activity bar. */
  bottom?: boolean;
}

const items: ActivityItem[] = [
  { id: 'explorer', label: 'Explorer', icon: <Files className="size-[18px]" /> },
  { id: 'git', label: 'Source Control', icon: <GitBranch className="size-[18px]" /> },
  { id: 'orchestration', label: 'Orchestration', icon: <Network className="size-[18px]" /> },
  { id: 'browser', label: 'Browser', icon: <Globe className="size-[18px]" /> },
  { id: 'terminal', label: 'Terminal', icon: <Terminal className="size-[18px]" />, bottom: true },
];

// ── Component ──────────────────────────────────────────────────
interface ActivityBarProps {
  activePanel: ExplorerPanel;
  sidebarOpen: boolean;
  terminalOpen: boolean;
  onPanelClick: (panel: ExplorerPanel) => void;
  workspaceId?: string;
}

/**
 * ActivityBar — narrow icon strip for the explorer workspace.
 *
 * Explorer, Search, Source Control, Orchestration (top) and Terminal (bottom).
 * Shows a badge on the orchestration icon when subagents are running.
 */
export function ActivityBar({
  activePanel, sidebarOpen, terminalOpen, onPanelClick, workspaceId,
}: ActivityBarProps) {
  const entries = useSubagentStore((s) => s.entries);

  const runningCount = useMemo(() => {
    if (!workspaceId) return 0;
    return Object.values(entries).filter(
      (e) => e.workspaceId === workspaceId && (e.status === 'running' || e.status === 'queued'),
    ).length;
  }, [entries, workspaceId]);

  const topItems = items.filter((i) => !i.bottom);
  const bottomItems = items.filter((i) => i.bottom);

  return (
    <nav className="flex w-10 shrink-0 flex-col items-center border-r border-[var(--border-default)] bg-[var(--bg-surface)] py-1">
      {/* Top items */}
      {topItems.map((item) => {
        const isActive = sidebarOpen && activePanel === item.id;
        const showBadge = item.id === 'orchestration' && runningCount > 0;
        return (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onPanelClick(item.id)}
                className={cn(
                  'relative text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                  isActive && 'text-[var(--status-success)]',
                )}
              >
                {item.icon}
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-[var(--status-success)]" />
                )}
                {showBadge && (
                  <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-[var(--status-info)] text-[8px] font-bold text-white">
                    {runningCount > 9 ? '9+' : runningCount}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {item.label}
              {showBadge && ` (${runningCount} running)`}
            </TooltipContent>
          </Tooltip>
        );
      })}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom items */}
      {bottomItems.map((item) => {
        const isActive = item.id === 'terminal' ? terminalOpen : sidebarOpen && activePanel === item.id;
        return (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onPanelClick(item.id)}
                className={cn(
                  'relative text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                  isActive && 'text-[var(--status-success)]',
                )}
              >
                {item.icon}
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-[var(--status-success)]" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}
