/**
 * Main sidebar — APPS rows, a session search field, then the workspace
 * tree. The order and the class names follow the desktop `MainSidebar`.
 */

import { LayoutGrid, Loader2, Search, SquareKanban } from 'lucide-react';
import { Input } from '@sero-ai/ui/components/ui/input';
import { Separator } from '@sero-ai/ui/components/ui/separator';
import { cn } from '@sero-ai/ui/lib/utils';
import { useWorkspaceStore, type WorkspaceView } from '@/stores/workspace';
import { useSessionSearchStore } from '@/stores/session-search';
import { WorkspaceTree } from './WorkspaceTree';

interface MainSidebarProps {
  /** Called after a session is chosen, used on mobile to close the sheet. */
  onSessionSelect?: () => void;
}

const APPS: Array<{ view: WorkspaceView; label: string; icon: typeof SquareKanban }> = [
  { view: 'board', label: 'Board', icon: SquareKanban },
  { view: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
];

export function MainSidebar({ onSessionSelect }: MainSidebarProps) {
  const view = useWorkspaceStore((s) => s.view);
  const setView = useWorkspaceStore((s) => s.setView);
  const searchQuery = useSessionSearchStore((s) => s.query);
  const setSearchQuery = useSessionSearchStore((s) => s.setQuery);
  const searchStatus = useSessionSearchStore((s) => s.status);

  return (
    <aside className="flex size-full min-w-0 flex-col border-r border-[var(--border-default)] bg-[var(--bg-surface)]">
      <div className="flex flex-col gap-0.5 p-2">
        <span className="px-2 pb-1 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
          Apps
        </span>
        {APPS.map((app) => {
          const isActive = view === app.view;
          return (
            <button
              key={app.view}
              type="button"
              onClick={() => setView(app.view)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors',
                isActive
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
              )}
            >
              <app.icon
                className={cn(
                  'size-4 shrink-0',
                  isActive ? 'text-[var(--brand-primary)]' : 'text-[var(--text-muted)]',
                )}
              />
              {app.label}
            </button>
          );
        })}
      </div>

      <Separator />

      <div className="p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search sessions..."
            aria-label="Search sessions"
            className="h-7 pl-7 pr-7 text-sm"
          />
          {searchStatus === 'searching' && (
            <Loader2
              className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-[var(--text-muted)]"
              aria-label="Searching"
            />
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <span className="block px-2 pb-1 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
          Workspaces
        </span>
        <WorkspaceTree onSessionSelect={onSessionSelect} />
      </div>
    </aside>
  );
}
