import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, Brain, Loader2 } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';

/**
 * ThinkingBlock, collapsible card that renders model thinking/reasoning text.
 *
 * Styled to match ToolCallGroup: same rounded-lg border card, chevron toggle,
 * AnimatePresence expand/collapse, and text sizing conventions.
 */
export function ThinkingBlock({
  thinking,
  isStreaming = false,
}: {
  /** Accumulated thinking text. */
  thinking: string;
  /** True while thinking deltas are still arriving. */
  isStreaming?: boolean;
}) {
  // Manual toggle, null means follow automatic behaviour.
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const contentRef = useRef<HTMLPreElement>(null);

  // Auto: expand while streaming, collapse when done.
  const expanded = manualExpanded ?? isStreaming;

  // Reset manual override when streaming state changes (auto-collapse on finish).
  const prevStreaming = useRef(isStreaming);
  useEffect(() => {
    if (prevStreaming.current && !isStreaming) setManualExpanded(null);
    prevStreaming.current = isStreaming;
  }, [isStreaming]);

  // Auto-scroll the thinking content while streaming
  useEffect(() => {
    if (isStreaming && expanded && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [thinking, isStreaming, expanded]);

  // Live elapsed-time counter (ticks every second while streaming,
  // captures final value when streaming ends, even sub-1s durations).
  const startTime = useRef(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isStreaming) {
      // Capture final elapsed when thinking finishes
      if (startTime.current > 0) {
        setElapsed(Math.round((Date.now() - startTime.current) / 1000));
      }
      return;
    }
    startTime.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isStreaming]);

  // Truncated preview for the summary bar
  const preview = thinking.slice(0, 120).replace(/\n/g, ' ').trim();

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'group/tb overflow-hidden rounded-lg border transition-colors duration-200',
        isStreaming
          ? 'border-[var(--status-warning-border)] bg-[var(--status-warning-faint)]'
          : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50',
      )}
    >
      {/* Summary bar */}
      <button type="button"
        onClick={() => setManualExpanded((prev) => !(prev ?? expanded))}
        className={cn(
          'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-150',
          'hover:bg-[var(--bg-elevated)]/80',
        )}
      >
        <motion.div
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          <ChevronRight className="size-3.5 text-[var(--text-muted)]" />
        </motion.div>

        <Brain className="size-3.5 text-[var(--status-warning)]" />

        {isStreaming ? (
          <>
            <Loader2 className="size-3 animate-spin text-[var(--status-warning)]" />
            <span className="text-xs font-medium text-[var(--status-warning)]">
              Thinking{elapsed > 0 ? ` for ${elapsed}s` : '...'}
            </span>
          </>
        ) : (
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {elapsed > 0 ? `Thought for ${elapsed}s` : 'Thought'}
          </span>
        )}

        {!expanded && preview && (
          <span className="min-w-0 truncate text-[11px] text-[var(--text-muted)]/60">
            {preview}
          </span>
        )}
      </button>

      {/* Expanded: full thinking content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--border-subtle)]">
              <pre
                ref={contentRef}
                className={cn(
                  'max-h-[300px] overflow-y-auto whitespace-pre-wrap px-3 py-2',
                  'font-mono text-[11px] leading-relaxed text-[var(--text-muted)]',
                  'scrollbar-thin scrollbar-thumb-[var(--border-subtle)]',
                )}
              >
                {thinking}
                {isStreaming && (
                  <span className="inline-block h-3 w-px animate-pulse bg-[var(--status-warning)]/60" />
                )}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
