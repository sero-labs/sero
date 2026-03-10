import type { KeyboardEvent } from 'react';
import { Star } from 'lucide-react';
import { Badge } from '@sero/ui/components/ui/badge';
import { Button } from '@sero/ui/components/ui/button';
import { cn } from '@sero/ui/lib/utils';
import { getAppIcon } from '@/lib/app-icons';
import type { AppEntry } from '@/stores/app';

interface AppStoreCardProps {
  entry: AppEntry;
  active: boolean;
  favourite: boolean;
  onActivate: () => void;
  onToggleFavourite: () => void;
}

export function AppStoreCard({
  entry,
  active,
  favourite,
  onActivate,
  onToggleFavourite,
}: AppStoreCardProps) {
  const manifest = entry.manifest;
  const Icon = getAppIcon(entry.icon);

  if (!manifest) return null;

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onActivate();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={handleCardKeyDown}
      className={cn(
        'group rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--border-strong)]',
        active
          ? 'border-[var(--border-strong)] bg-[var(--bg-elevated)]'
          : 'border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)]',
      )}
      aria-label={`Open ${entry.label}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--bg-base)] text-[var(--text-secondary)]">
          <Icon className="size-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-[var(--text-primary)]">
              {entry.label}
            </span>
            {manifest.version ? (
              <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
                v{manifest.version}
              </span>
            ) : null}
          </div>
          <p className="truncate text-xs text-[var(--text-muted)]">
            {manifest.packageName ?? 'Unknown package'}
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={favourite ? `Remove ${entry.label} from favourites` : `Add ${entry.label} to favourites`}
          aria-pressed={favourite}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavourite();
          }}
        >
          <Star className={cn('size-4', favourite ? 'fill-current text-[var(--status-warning)]' : 'text-[var(--text-muted)]')} />
        </Button>
      </div>

      <p className="mt-3 min-h-10 text-xs leading-5 text-[var(--text-secondary)]">
        {manifest.description ?? 'No description available.'}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[11px] capitalize">
          {manifest.scope}
        </Badge>
        {active ? (
          <Badge variant="secondary" className="text-[11px]">
            Open
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
