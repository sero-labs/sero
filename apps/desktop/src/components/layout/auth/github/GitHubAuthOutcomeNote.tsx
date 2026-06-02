import { AlertCircle, RotateCcw } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';

export interface GitHubAuthOutcomeNoteProps {
  outcome: 'cancelled' | 'error';
  message?: string;
  onRetry: () => void;
  className?: string;
}

export function GitHubAuthOutcomeNote({
  outcome,
  message,
  onRetry,
  className,
}: GitHubAuthOutcomeNoteProps) {
  const isError = outcome === 'error';
  const description = isError
    ? message ?? 'GitHub login did not complete. Try again when you’re ready.'
    : 'GitHub is still disconnected. Try again when you’re ready.';

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 rounded border px-2 py-1 text-[10px]',
        isError
          ? 'border-status-error-border bg-status-error-muted/70 text-status-error'
          : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]/20 text-[var(--text-muted)]',
        className,
      )}
    >
      <span className="min-w-0 flex-1 leading-relaxed">{description}</span>
      <button
        type="button"
        onClick={onRetry}
        className={cn(
          'inline-flex shrink-0 items-center gap-1 text-[10px] font-medium transition-colors',
          isError ? 'hover:text-status-error/80' : 'hover:text-[var(--text-primary)]',
        )}
      >
        {isError ? <AlertCircle className="size-3" /> : <RotateCcw className="size-3" />}
        Try again
      </button>
    </div>
  );
}
