/**
 * Choice card — a question an agent is waiting on, above the composer.
 *
 * Copies the desktop `PendingQuestionCard` classes: the info border, the
 * pulsing dot, the numbered option rows. There is no cancel button and no
 * free-text answer, because the gateway carries neither.
 */

import { Loader2 } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import { useChoicesStore, type PendingChoice } from '@/stores/choices';

/** How long is left, in words. */
function formatRemaining(expiresAt: string): string | null {
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null;
  const minutes = Math.round(remainingMs / 60_000);
  if (minutes < 1) return 'under a minute left';
  return `${minutes}m left`;
}

export function ChoiceCard() {
  const choices = useChoicesStore((s) => s.choices);
  const error = useChoicesStore((s) => s.error);

  // The oldest choice waited longest, so it is answered first.
  const choice = choices[0];
  if (!choice) return null;

  return (
    <div className="px-3 pb-2">
      <ChoicePrompt choice={choice} pendingCount={choices.length} />
      {error && (
        <p className="mt-1 rounded-md border border-status-error-border bg-status-error-muted px-2.5 py-1.5 text-xs text-status-error">
          {error}
        </p>
      )}
    </div>
  );
}

function ChoicePrompt({
  choice,
  pendingCount,
}: {
  choice: PendingChoice;
  pendingCount: number;
}) {
  const answer = useChoicesStore((s) => s.answer);
  const answering = useChoicesStore((s) => s.answering);
  const isAnswering = answering.includes(choice.id);
  const remaining = choice.expiresAt ? formatRemaining(choice.expiresAt) : null;

  return (
    <div
      data-testid="choice-card"
      className="overflow-hidden rounded-lg border border-status-info-border bg-status-info-faint"
    >
      <div className="flex items-center gap-2.5 px-3 py-2">
        {isAnswering ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-status-info" />
        ) : (
          <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-status-info" />
        )}
        <span className="flex-1 truncate text-xs font-medium text-[var(--text-secondary)]">
          {choice.source ?? 'question'}
        </span>
        {pendingCount > 1 && (
          <span className="shrink-0 text-xs text-[var(--text-muted)]">
            {pendingCount - 1} more waiting
          </span>
        )}
        {remaining && (
          <span className="shrink-0 text-xs text-[var(--text-muted)]">{remaining}</span>
        )}
      </div>

      <div className="border-t border-[var(--border-subtle)] px-3 pb-1 pt-2.5">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{choice.title}</p>
        {choice.body && (
          <p className="mt-0.5 text-sm text-[var(--text-primary)]">{choice.body}</p>
        )}
      </div>

      <div className="space-y-0.5 p-2">
        {choice.options.map((option, index) => (
          <button
            type="button"
            key={option.id}
            disabled={isAnswering}
            onClick={() => answer(choice.id, option.id)}
            className={cn(
              'flex w-full items-start gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors',
              'hover:bg-[var(--bg-elevated)]/80 disabled:opacity-50',
            )}
          >
            <span className="mt-px text-xs font-medium text-[var(--text-muted)]">
              {index + 1}.
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-sm text-[var(--text-primary)]">{option.label}</span>
              {option.description && (
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{option.description}</p>
              )}
            </div>
          </button>
        ))}
      </div>

      {choice.fallbackLabel && (
        <p className="border-t border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-muted)]">
          No answer: {choice.fallbackLabel}
        </p>
      )}
    </div>
  );
}
