import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, Database } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';

/**
 * MemoryContextBlock, collapsible card showing the memory context
 * injected for this turn. Styled to match ThinkingBlock / ToolCallGroup.
 *
 * Starts collapsed by default (unlike ThinkingBlock which auto-expands
 * during streaming). The user can expand to inspect what memories
 * were loaded for the current response.
 */
export function MemoryContextBlock({ context }: { context: string }) {
  const [expanded, setExpanded] = useState(false);

  // Count sections for the summary label
  const sectionCount = (context.match(/^##+ /gm) ?? []).length;
  const preview = context.slice(0, 120).replace(/\n/g, ' ').replace(/#+\s*/g, '').trim();

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'group/mb overflow-hidden rounded-lg border transition-colors duration-200',
        'border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50',
      )}
    >
      {/* Summary bar */}
      <button type="button"
        onClick={() => setExpanded((prev) => !prev)}
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

        <Database className="size-3.5 text-[var(--accent-primary)]" />

        <span className="text-xs font-medium text-[var(--text-secondary)]">
          Memory{sectionCount > 0 ? ` (${sectionCount} sections)` : ''}
        </span>

        {!expanded && preview && (
          <span className="min-w-0 truncate text-[11px] text-[var(--text-muted)]/60">
            {preview}
          </span>
        )}
      </button>

      {/* Expanded: full memory context */}
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
                className={cn(
                  'max-h-[300px] overflow-y-auto whitespace-pre-wrap px-3 py-2',
                  'font-mono text-[11px] leading-relaxed text-[var(--text-muted)]',
                  'scrollbar-thin scrollbar-thumb-[var(--border-subtle)]',
                )}
              >
                {context}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
