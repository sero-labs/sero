import { Button } from '@sero-ai/ui/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sero-ai/ui/components/ui/tooltip';
import { Star } from 'lucide-react';
import { useAppStore } from '@/stores/app';
import { MAX_CHROME_SHORTCUTS, normaliseChromeShortcutsForApps } from '@/stores/app/shared';
import { useActiveWorkspace } from '@/stores/workspace';
import { getAppIcon } from '@/lib/app-icons';

/** Active app · workspace breadcrumb with a star to pin the app as a shortcut. */
export function TitleBarBreadcrumb() {
  const activeApp = useAppStore((s) => s.activeApp);
  const apps = useAppStore((s) => s.apps);
  const pinned = useAppStore((s) => s.isChromeShortcut(s.activeApp));
  const atCap = useAppStore(
    (s) => normaliseChromeShortcutsForApps(s.chromeShortcuts, s.apps).length >= MAX_CHROME_SHORTCUTS,
  );
  const toggleChromeShortcut = useAppStore((s) => s.toggleChromeShortcut);
  const activeWorkspace = useActiveWorkspace();

  const entry = apps.find((app) => app.id === activeApp);
  const Icon = getAppIcon(entry?.icon);
  const appLabel = entry?.label ?? 'Sero';
  const pinLabel = pinned
    ? 'Unpin from shortcuts'
    : atCap
      ? `Shortcut limit reached (${MAX_CHROME_SHORTCUTS}) — unpin one first`
      : 'Pin to shortcuts';

  return (
    <div className="no-drag flex min-w-0 items-center gap-1.5">
      <Icon className="size-3.5 shrink-0 text-[var(--brand-primary)]" />
      <span className="truncate text-xs font-medium text-[var(--text-secondary)]" style={{ maxWidth: '30vw' }}>
        {appLabel}
        {activeWorkspace?.name && (
          <span className="text-[var(--text-muted)]"> · {activeWorkspace.name}</span>
        )}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => toggleChromeShortcut(activeApp)}
            aria-label={pinLabel}
            aria-disabled={!pinned && atCap}
            className={
              pinned
                ? 'text-[var(--brand-primary)] hover:text-[var(--brand-primary)]'
                : `text-[var(--text-muted)] hover:text-[var(--text-secondary)] ${!pinned && atCap ? 'opacity-40' : ''}`
            }
          >
            <Star className={`size-3.5 ${pinned ? 'fill-current' : ''}`} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="chrome-zoom-invariant">{pinLabel}</TooltipContent>
      </Tooltip>
    </div>
  );
}
