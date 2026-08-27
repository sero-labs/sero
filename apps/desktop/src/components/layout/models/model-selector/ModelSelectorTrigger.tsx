import { memo } from 'react';
import { ChevronDown } from 'lucide-react';
import { PopoverTrigger } from '@sero-ai/ui/components/ui/popover';
import { cn } from '@sero-ai/ui/lib/utils';

function ModelSelectorTrigger({
  disabled,
  hasActiveAvailableModel,
  label,
  providerDisplayName,
  providerLogo,
  thinkingLabel,
  onPrime,
  ariaLabel,
  className,
  labelClassName,
}: {
  disabled: boolean;
  hasActiveAvailableModel: boolean;
  label: string;
  onPrime: () => void;
  providerDisplayName: string | null;
  providerLogo: string | null;
  thinkingLabel: string | null;
  ariaLabel?: string;
  className?: string;
  labelClassName?: string;
}) {
  return (
    <PopoverTrigger asChild disabled={disabled}>
      <button type="button"
        aria-label={ariaLabel}
        onFocus={onPrime}
        onMouseEnter={onPrime}
        className={cn(
          'group flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-[var(--text-secondary)] transition-all duration-150',
          'hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-40',
          className,
        )}
      >
        {hasActiveAvailableModel && providerLogo && providerDisplayName ? (
          <img
            src={providerLogo}
            alt={providerDisplayName}
            className="size-3.5 rounded-sm dark:invert"
          />
        ) : null}
        <span className={cn('max-w-[140px] truncate font-medium', labelClassName)}>{label}</span>
        {thinkingLabel ? (
          <span className="rounded-full bg-status-warning-subtle px-1.5 py-px text-sm font-semibold text-status-warning">
            {thinkingLabel}
          </span>
        ) : null}
        <ChevronDown className="size-3 text-[var(--text-muted)] transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </button>
    </PopoverTrigger>
  );
}

export const MemoizedModelSelectorTrigger = memo(ModelSelectorTrigger);
