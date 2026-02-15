import { Files, Search, GitBranch, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────
export type CodingPanel = 'explorer' | 'search' | 'git' | 'terminal';

interface ActivityItem {
  id: CodingPanel;
  label: string;
  icon: React.ReactNode;
  /** If true, this item is placed at the bottom of the activity bar. */
  bottom?: boolean;
}

const items: ActivityItem[] = [
  { id: 'explorer', label: 'Explorer', icon: <Files className="size-[18px]" /> },
  { id: 'search', label: 'Search', icon: <Search className="size-[18px]" /> },
  { id: 'git', label: 'Source Control', icon: <GitBranch className="size-[18px]" /> },
  { id: 'terminal', label: 'Terminal', icon: <Terminal className="size-[18px]" />, bottom: true },
];

// ── Component ──────────────────────────────────────────────────
interface ActivityBarProps {
  activePanel: CodingPanel;
  sidebarOpen: boolean;
  terminalOpen: boolean;
  onPanelClick: (panel: CodingPanel) => void;
}

/**
 * ActivityBar — narrow icon strip for the coding workspace.
 *
 * Explorer, Search, Source Control (top) and Terminal (bottom).
 */
export function ActivityBar({ activePanel, sidebarOpen, terminalOpen, onPanelClick }: ActivityBarProps) {
  const topItems = items.filter((i) => !i.bottom);
  const bottomItems = items.filter((i) => i.bottom);

  return (
    <nav className="flex w-10 shrink-0 flex-col items-center border-r border-border/50 bg-[var(--bg-surface)] py-1">
      {/* Top items */}
      {topItems.map((item) => {
        const isActive = sidebarOpen && activePanel === item.id;
        return (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onPanelClick(item.id)}
                className={cn(
                  'relative text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                  isActive && 'text-[var(--text-primary)]',
                )}
              >
                {item.icon}
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-[var(--text-primary)]" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
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
                  isActive && 'text-[var(--text-primary)]',
                )}
              >
                {item.icon}
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-[var(--text-primary)]" />
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
