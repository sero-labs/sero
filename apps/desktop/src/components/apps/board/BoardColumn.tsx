/**
 * One Agent Board column: accent-coloured header with an animated count,
 * collapsible body, and spring-animated card list. Cards share layoutIds
 * across columns, so a loop finishing visibly glides from Active to Finished.
 */

import { memo } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { useAgentBoardStore } from '@/stores/agent-board';
import type { BoardColumnId } from '@/types/board';
import type { BoardCard as BoardCardModel } from './board-model';
import { COLUMN_ORDER } from './board-constants';
import { BoardCard } from './BoardCard';

const COLUMN_META: Record<
  BoardColumnId,
  { label: string; dot: string; countClass: string }
> = {
  backlog: {
    label: 'Backlog',
    dot: 'bg-[var(--text-muted)]',
    countClass: 'bg-[var(--bg-overlay)] text-[var(--text-muted)]',
  },
  active: {
    label: 'Active',
    dot: 'bg-status-success',
    countClass: 'bg-status-success-muted text-status-success',
  },
  attention: {
    label: 'Needs Attention',
    dot: 'bg-status-warning',
    countClass: 'bg-status-warning-muted text-status-warning',
  },
  done: {
    label: 'Finished',
    dot: 'bg-status-info',
    countClass: 'bg-status-info-muted text-status-info',
  },
};

interface BoardColumnProps {
  columnId: BoardColumnId;
  cards: BoardCardModel[];
  collapsed: boolean;
  /** Column position, drives the staggered entrance. */
  index: number;
  nowMs: number;
}

export const BoardColumn = memo(function BoardColumn({
  columnId,
  cards,
  collapsed,
  index,
  nowMs,
}: BoardColumnProps) {
  const toggleColumn = useAgentBoardStore((s) => s.toggleColumn);
  const meta = COLUMN_META[columnId];
  const highlight = columnId === 'attention' && cards.length > 0;

  return (
    <m.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: 'easeOut' }}
      className={`flex min-h-0 flex-col rounded-xl border bg-[var(--bg-surface)]/60 ${
        highlight ? 'border-status-warning-border' : 'border-[var(--border-subtle)]'
      }`}
    >
      <button
        type="button"
        onClick={() => toggleColumn(columnId)}
        className="flex shrink-0 items-center gap-2 rounded-t-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-overlay)]/50"
      >
        <span className={`size-2 shrink-0 rounded-full ${meta.dot}`} />
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          {meta.label}
        </span>
        <AnimatePresence mode="popLayout" initial={false}>
          <m.span
            key={cards.length}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className={`rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${meta.countClass}`}
          >
            {cards.length}
          </m.span>
        </AnimatePresence>
        <m.span
          animate={{ rotate: collapsed ? -90 : 0 }}
          transition={{ duration: 0.15 }}
          className="ml-auto text-[var(--text-muted)]"
        >
          <ChevronDown className="size-3.5" />
        </m.span>
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <m.div
            key="body"
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="min-h-0 flex-1 overflow-hidden"
          >
            <div className="flex h-full flex-col gap-2 overflow-y-auto px-2 pb-2">
              <AnimatePresence mode="popLayout" initial={false}>
                {cards.map((card) => (
                  <BoardCard key={card.key} card={card} columnId={columnId} nowMs={nowMs} />
                ))}
              </AnimatePresence>
              {cards.length === 0 && (
                <div className="mx-1 mt-1 rounded-lg border border-dashed border-[var(--border-subtle)] px-3 py-6 text-center text-xs text-[var(--text-muted)]">
                  {columnId === 'attention' ? 'All clear' : 'Nothing here'}
                </div>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </m.section>
  );
});
