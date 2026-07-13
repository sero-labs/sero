import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';

export function GitShipActionPill({
  label,
  icon,
  onClick,
  busy,
  disabled,
  emphasis = false,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  emphasis?: boolean;
}) {
  return (
    <button type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors',
        emphasis
          ? 'border-[var(--accent-primary)]/25 bg-[var(--accent-muted)] text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/15'
          : 'border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]',
        'disabled:cursor-not-allowed disabled:opacity-45',
      )}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}
