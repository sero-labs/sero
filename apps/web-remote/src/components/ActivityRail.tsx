/**
 * Activity rail — the `w-10` icon strip that switches the right-hand
 * panel on desktop widths. Copies the desktop `ActivityBar` active
 * style: brand-coloured icon plus a 2px rail on the leading edge.
 *
 * On mobile the panels are sheets, so the rail is not rendered.
 */

import { FileText, GitBranch, Image as ImageIcon, Monitor } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import { useLayoutStore, type RightPanel } from '@/stores/layout';

interface RailItem {
  id: RightPanel;
  label: string;
  icon: typeof FileText;
  /** Panels whose feature has not shipped yet stay out of the rail. */
  enabled: boolean;
}

const ITEMS: RailItem[] = [
  { id: 'files', label: 'Files', icon: FileText, enabled: true },
  { id: 'artifacts', label: 'Artifacts', icon: ImageIcon, enabled: true },
  { id: 'preview', label: 'Dev server preview', icon: Monitor, enabled: true },
  { id: 'changes', label: 'Changes', icon: GitBranch, enabled: false },
];

interface ActivityRailProps {
  /** Highlights the preview icon while a dev server is up. */
  hasRunningDevServers: boolean;
}

export function ActivityRail({ hasRunningDevServers }: ActivityRailProps) {
  const rightPanel = useLayoutStore((s) => s.rightPanel);
  const toggleRightPanel = useLayoutStore((s) => s.toggleRightPanel);

  return (
    <nav
      aria-label="Panels"
      className="flex w-10 shrink-0 flex-col items-center border-l border-[var(--border-default)] bg-[var(--bg-surface)] py-1"
    >
      {ITEMS.filter((item) => item.enabled).map((item) => {
        const isActive = rightPanel === item.id;
        const isLive = item.id === 'preview' && hasRunningDevServers;
        return (
          <Button
            key={item.id}
            variant="ghost"
            size="icon-sm"
            aria-label={item.label}
            title={item.label}
            data-panel={item.id}
            onClick={() => toggleRightPanel(item.id)}
            className={cn(
              'relative text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
              isLive && 'text-status-success',
              isActive && 'text-[var(--brand-primary)]',
            )}
          >
            <item.icon className="size-[18px]" />
            {isActive && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-[var(--brand-primary)]" />
            )}
          </Button>
        );
      })}
    </nav>
  );
}
