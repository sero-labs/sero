/**
 * ResponseFeedback — thumbs up / thumbs down on assistant messages.
 *
 * Appears after an assistant response finishes streaming.
 * Persists ratings to ~/.sero-ui/agent/feedback.json for later review.
 */

import { useCallback } from 'react';
import { ThumbsUp, ThumbsDown, Copy, Check } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import { useFeedbackStore } from '@/stores/feedback';
import { useTransientFlag } from '@/components/apps/explorer/useTransientUiState';
import { copyTextToClipboard } from '@/lib/copy-to-clipboard';

interface ResponseFeedbackProps {
  messageId: string;
  sessionId: string;
  /** Excerpt of the user prompt that preceded this response. */
  promptExcerpt?: string;
  /** Excerpt of the assistant's response text. */
  responseExcerpt?: string;
  /** Full response text for copy-to-clipboard. */
  responseText?: string;
}

export function ResponseFeedback({
  messageId,
  sessionId,
  promptExcerpt,
  responseExcerpt,
  responseText,
}: ResponseFeedbackProps) {
  const rating = useFeedbackStore((s) => s.ratings[messageId]);
  const rate = useFeedbackStore((s) => s.rate);
  const unrate = useFeedbackStore((s) => s.unrate);
  const [copied, showCopied] = useTransientFlag(2000);

  const handleCopy = useCallback(async () => {
    const text = responseText ?? responseExcerpt;
    if (!text) return;
    if (!(await copyTextToClipboard(text))) return;
    showCopied();
  }, [responseText, responseExcerpt, showCopied]);

  const handleRate = useCallback(
    (value: 'good' | 'bad') => {
      if (rating === value) {
        // Toggle off
        unrate(messageId);
      } else {
        rate({
          messageId,
          sessionId,
          rating: value,
          promptExcerpt,
          responseExcerpt,
        });
      }
    },
    [messageId, sessionId, promptExcerpt, responseExcerpt, rating, rate, unrate],
  );

  return (
    <div
      className={cn(
        'flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/msg:opacity-100 focus-within:opacity-100 has-[button[data-active=true]]:opacity-100',
        copied && 'opacity-100',
      )}
    >
      <button
        type="button"
        data-active={rating === 'good'}
        onClick={() => handleRate('good')}
        className={cn(
          'rounded-md p-1 transition-colors duration-100',
          rating === 'good'
            ? 'text-[var(--status-success)]'
            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]',
        )}
        title="Good response"
      >
        <ThumbsUp className="size-3" />
      </button>
      <button
        type="button"
        data-active={rating === 'bad'}
        onClick={() => handleRate('bad')}
        className={cn(
          'rounded-md p-1 transition-colors duration-100',
          rating === 'bad'
            ? 'text-[var(--status-error)]'
            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]',
        )}
        title="Bad response"
      >
        <ThumbsDown className="size-3" />
      </button>
      <button
        type="button"
        aria-label="Copy response to clipboard"
        onClick={handleCopy}
        className="rounded-md p-1 transition-colors duration-100 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
        title="Copy to clipboard"
      >
        {copied ? (
          <Check className="size-3 text-[var(--status-success)]" />
        ) : (
          <Copy className="size-3" />
        )}
      </button>
    </div>
  );
}
