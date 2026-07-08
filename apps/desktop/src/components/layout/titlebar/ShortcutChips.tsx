import { Tooltip, TooltipContent, TooltipTrigger } from '@sero-ai/ui/components/ui/tooltip';
import { useAppStore } from '@/stores/app';
import { getAppIcon } from '@/lib/app-icons';
import { openApp } from '@/lib/open-app';

/**
 * Pinned shortcut chips in the title-bar center — one-click jumps to
 * apps, available even with the sidebar collapsed. Pin/unpin via the
 * breadcrumb star. Shortcuts whose app isn't installed are skipped.
 */
export function ShortcutChips() {
  const shortcuts = useAppStore((s) => s.chromeShortcuts);
  const apps = useAppStore((s) => s.apps);
  const activeApp = useAppStore((s) => s.activeApp);

  const entries = shortcuts
    .map((id) => apps.find((app) => app.id === id))
    .filter((entry) => entry !== undefined);

  if (entries.length === 0) return null;

  return (
    <div className="no-drag flex items-center gap-0.5">
      {entries.map((entry) => {
        const Icon = getAppIcon(entry.icon);
        const active = entry.id === activeApp;
        return (
          <Tooltip key={entry.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => openApp(entry.id)}
                aria-label={entry.label}
                className={`relative flex h-7 w-8 items-center justify-center rounded-md transition-colors ${
                  active
                    ? 'bg-[var(--bg-elevated)] text-[var(--brand-primary)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <Icon className="size-3.5" />
                {active && (
                  <span className="absolute inset-x-2 -bottom-[5px] h-0.5 rounded-full bg-[var(--brand-primary)]" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{entry.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
