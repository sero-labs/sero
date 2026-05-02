/**
 * SubagentOutput — expandable output viewer within a card.
 *
 * Renders the full response or error text with a copy button
 * and max-height scrollable container.
 */

import { useCallback } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import { copyTextToClipboard } from '@/lib/copy-to-clipboard';
import { useTransientFlag } from '../useTransientUiState';

interface SubagentOutputProps {
  response?: string;
  error?: string;
  isFailed: boolean;
}

export function SubagentOutput({ response, error, isFailed }: SubagentOutputProps) {
  const [copied, showCopied] = useTransientFlag(2000);
  const text = isFailed ? (error ?? '') : (response ?? '');

  const handleCopy = useCallback(async () => {
    if (!(await copyTextToClipboard(text))) return;
    showCopied();
  }, [showCopied, text]);

  return (
    <div className="mt-1.5 relative">
      {/* Copy button */}
      <button
        onClick={handleCopy}
        className="absolute right-1 top-1 rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-secondary)] transition-colors"
        title="Copy to clipboard"
      >
        {copied ? (
          <Check className="size-3 text-[var(--status-success)]" />
        ) : (
          <Copy className="size-3" />
        )}
      </button>

      {/* Content */}
      <pre
        className={cn(
          'max-h-48 overflow-auto rounded-md p-2 text-[10px] leading-relaxed whitespace-pre-wrap break-words',
          isFailed
            ? 'bg-[var(--status-error-muted)] text-[var(--status-error)]'
            : 'bg-[var(--bg-base)] text-[var(--text-secondary)]',
        )}
      >
        {text}
      </pre>
    </div>
  );
}
