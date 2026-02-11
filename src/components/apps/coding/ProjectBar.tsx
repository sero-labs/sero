import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

/**
 * ProjectBar — tab bar for open projects within the coding workspace.
 *
 * Placeholder with static tabs for now.
 */
export function ProjectBar() {
  return (
    <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-border/50 bg-[var(--bg-surface)] px-2">
      <div className="flex h-6 items-center rounded bg-[var(--bg-elevated)] px-2.5 text-[11px] font-medium text-[var(--text-primary)]">
        Project 1
      </div>
      <div className="flex h-6 items-center rounded px-2.5 text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]">
        Project 2
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        className="ml-0.5 text-[var(--text-muted)]"
      >
        <Plus className="size-3" />
      </Button>
    </div>
  );
}
