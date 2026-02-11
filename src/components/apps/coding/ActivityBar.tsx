import { Files, Search, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────
export type CodingPanel = 'explorer' | 'search' | 'git';

interface ActivityItem {
  id: CodingPanel;
  label: string;
  icon: React.ReactNode;
}

const items: ActivityItem[] = [
  { id: 'explorer', label: 'Explorer', icon: <Files className="size-[18px]" /> },
  { id: 'search', label: 'Search', icon: <Search className="size-[18px]" /> },
  { id: 'git', label: 'Source Control', icon: <GitBranch className="size-[18px]" /> },
];

// ── Component ──────────────────────────────────────────────────
interface ActivityBarProps {
  activePanel: CodingPanel;
  sidebarOpen: boolean;
  onPanelClick: (panel: CodingPanel) => void;
}

/**
 * ActivityBar — narrow icon strip for the coding workspace.
 *
 * Explorer, Search, Source Control only.
 */
export function ActivityBar({ activePanel, sidebarOpen, onPanelClick }: ActivityBarProps) {
  return (
    <nav className="flex w-10 shrink-0 flex-col items-center border-r border-border/50 bg-[var(--bg-surface)] py-1">
      {items.map((item) => {
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
                  isActive && 'text-[var(--text-primary)]'
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
