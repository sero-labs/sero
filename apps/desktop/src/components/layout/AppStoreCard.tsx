import type { KeyboardEvent } from 'react';
import { Star } from 'lucide-react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import { getAppIcon } from '@/lib/app-icons';
import type { AppEntry } from '@/stores/app';

interface AppStoreCardProps {
  entry: AppEntry;
  active: boolean;
  favourite: boolean;
  onActivate: () => void;
  onToggleFavourite: () => void;
}

function formatLabel(value: string): string {
  return value
    .split('-')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
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

  const category = manifest.plugin?.category;
  const unsupportedReason = manifest.hostCompatibility?.supported === false
    ? manifest.hostCompatibility.issues[0]?.message ?? 'This plugin requires a newer Sero host.'
    : null;

  return (
    <div
      role={unsupportedReason ? undefined : 'button'}
      tabIndex={unsupportedReason ? -1 : 0}
      onClick={unsupportedReason ? undefined : onActivate}
      onKeyDown={unsupportedReason ? undefined : handleCardKeyDown}
      className={cn(
        'group rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--border-default)]',
        active
          ? 'border-[var(--border-default)] bg-[var(--bg-elevated)]'
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
            <span className="truncate text-base font-medium text-[var(--text-primary)]">
              {entry.label}
            </span>
            {manifest.version ? (
              <span className="shrink-0 text-sm text-[var(--text-muted)]">
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
          <Star
            className={cn(
              'size-4',
              favourite ? 'fill-current text-status-warning' : 'text-[var(--text-muted)]',
            )}
          />
        </Button>
      </div>

      <p className="mt-3 min-h-10 text-xs leading-5 text-[var(--text-secondary)]">
        {manifest.description ?? 'No description available.'}
      </p>
      {unsupportedReason ? (
        <p className="mt-2 text-xs text-status-error">{unsupportedReason}</p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        {category ? (
          <Badge
            variant="outline"
            className="text-sm capitalize border-status-success-border bg-status-success-muted text-status-success"
          >
            {formatLabel(category)}
          </Badge>
        ) : null}
        {unsupportedReason ? (
          <Badge
            variant="outline"
            className="text-sm border-status-error-border bg-status-error-muted text-status-error"
          >
            Unsupported host
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
