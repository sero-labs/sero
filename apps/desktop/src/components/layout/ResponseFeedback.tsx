/**
 * ResponseFeedback — thumbs up / thumbs down on assistant messages.
 *
 * Appears after an assistant response finishes streaming.
 * Persists ratings to ~/.sero-ui/agent/feedback.json for later review.
 */

import { useCallback } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { cn } from '@sero/ui/lib/utils';
import { useFeedbackStore } from '@/stores/feedback';

interface ResponseFeedbackProps {
  messageId: string;
  sessionId: string;
  /** Excerpt of the user prompt that preceded this response. */
  promptExcerpt?: string;
  /** Excerpt of the assistant's response text. */
  responseExcerpt?: string;
}

export function ResponseFeedback({
  messageId,
  sessionId,
  promptExcerpt,
  responseExcerpt,
}: ResponseFeedbackProps) {
  const rating = useFeedbackStore((s) => s.ratings[messageId]);
  const rate = useFeedbackStore((s) => s.rate);
  const unrate = useFeedbackStore((s) => s.unrate);

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
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/msg:opacity-100 has-[button[data-active=true]]:opacity-100">
      <button
        data-active={rating === 'good'}
        onClick={() => handleRate('good')}
        className={cn(
          'rounded-md p-1 transition-colors duration-100',
          rating === 'good'
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]',
        )}
        title="Good response"
      >
        <ThumbsUp className="size-3" />
      </button>
      <button
        data-active={rating === 'bad'}
        onClick={() => handleRate('bad')}
        className={cn(
          'rounded-md p-1 transition-colors duration-100',
          rating === 'bad'
            ? 'text-red-500 dark:text-red-400'
            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]',
        )}
        title="Bad response"
      >
        <ThumbsDown className="size-3" />
      </button>
    </div>
  );
}
