import { useMemo } from 'react';
import { Files, Terminal, Network, Globe } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sero-ai/ui/components/ui/tooltip';
import { cn } from '@sero-ai/ui/lib/utils';
import { getAppIcon } from '@/lib/app-icons';
import { getContributions, useAppStore } from '@/stores/app';
import { useSubagentStore } from '@/stores/subagent';
import type { ExplorerPanel } from '@/lib/explorer-panels';

export type { ExplorerPanel };

interface ActivityItem {
  id: ExplorerPanel;
  label: string;
  icon: React.ReactNode;
  /** If true, this item is placed at the bottom of the activity bar. */
  bottom?: boolean;
}

const builtinItems: ActivityItem[] = [
  { id: 'explorer', label: 'Explorer', icon: <Files className="size-[18px]" /> },
  { id: 'orchestration', label: 'Orchestration', icon: <Network className="size-[18px]" /> },
  { id: 'browser', label: 'Browser', icon: <Globe className="size-[18px]" /> },
  { id: 'terminal', label: 'Terminal', icon: <Terminal className="size-[18px]" />, bottom: true },
];

/** Activity-bar entries contributed to `ui.explorer.view`. */
function useContributedItems(): ActivityItem[] {
  const apps = useAppStore((s) => s.apps);
  return useMemo(
    () => getContributions(apps, 'ui.explorer.view').map((resolved) => {
      const view = resolved.contribution;
      const Icon = getAppIcon(view.icon ?? resolved.app.icon);
      return {
        id: resolved.key,
        label: view.label ?? resolved.app.label,
        icon: <Icon className="size-[18px]" />,
      };
    }),
    [apps],
  );
}

// ── Component ──────────────────────────────────────────────────
interface ActivityBarProps {
  activePanel: ExplorerPanel;
  sidebarOpen: boolean;
  terminalOpen: boolean;
  onPanelClick: (panel: ExplorerPanel) => void;
  workspaceId?: string;
}

/**
 * ActivityBar, narrow icon strip for the explorer workspace.
 *
 * Built-in panels first, then any view an installed app contributes via
 * `ui.explorer.view` — the Git view arrives that way. Shows a badge on the
 * orchestration icon when subagents are running.
 */
export function ActivityBar({
  activePanel, sidebarOpen, terminalOpen, onPanelClick, workspaceId,
}: ActivityBarProps) {
  const entries = useSubagentStore((s) => s.entries);
  const contributedItems = useContributedItems();

  const runningCount = useMemo(() => {
    if (!workspaceId) return 0;
    return Object.values(entries).filter(
      (e) => e.workspaceId === workspaceId && (e.status === 'running' || e.status === 'queued'),
    ).length;
  }, [entries, workspaceId]);

  const topItems = [...builtinItems.filter((i) => !i.bottom), ...contributedItems];
  const bottomItems = builtinItems.filter((i) => i.bottom);

  return (
    <nav className="window-glass-sidebar flex w-10 shrink-0 flex-col items-center border-r border-[var(--border-default)] bg-[var(--bg-surface)] py-1">
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
                aria-label={item.label}
                data-explorer-panel={item.id}
                onClick={() => onPanelClick(item.id)}
                className={cn(
                  'relative text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                  isActive && 'text-[var(--brand-primary)]',
                )}
              >
                {item.icon}
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-[var(--brand-primary)]" />
                )}
                {showBadge && (
                  <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-status-info text-xs font-bold text-white">
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
                aria-label={item.label}
                data-explorer-panel={item.id}
                onClick={() => onPanelClick(item.id)}
                className={cn(
                  'relative text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                  isActive && 'text-[var(--brand-primary)]',
                )}
              >
                {item.icon}
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-[var(--brand-primary)]" />
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
