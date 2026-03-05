/**
 * CardView — a single card on the board.
 *
 * State-driven border colors with subtle bg tints, motion.div
 * entrance animations, expandable subtask list with stagger delays.
 */

import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Card } from '../../shared/types';
import { CardStatusDot, SubtaskStatusDot } from './StatusDot';
import { PriorityBadge } from './PriorityBadge';

function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function CardView({
  card,
  onSelect,
}: {
  card: Card;
  onSelect: (card: Card) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const progress =
    card.subtasks.length > 0
      ? (card.subtasks.filter((s) => s.status === 'completed').length /
          card.subtasks.length) *
        100
      : 0;

  const handleClick = useCallback(() => {
    onSelect(card);
  }, [card, onSelect]);

  const handleExpandToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => !prev);
  }, []);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
      transition={{ duration: 0.2 }}
      onClick={handleClick}
      className={cn(
        'group cursor-pointer overflow-hidden rounded-lg border transition-colors duration-200',
        card.status === 'agent-working'
          ? 'border-blue-500/25 bg-blue-500/[0.04]'
          : card.status === 'failed'
            ? 'border-red-500/25 bg-red-500/[0.04]'
            : card.status === 'waiting-input'
              ? 'border-amber-500/25 bg-amber-500/[0.04]'
              : 'border-[var(--kb-border)] bg-[var(--kb-surface)] hover:border-[var(--kb-accent)]/20',
      )}
    >
      {/* Progress bar for agent-working cards */}
      {card.status === 'agent-working' && card.subtasks.length > 0 && (
        <motion.div
          className="h-0.5 bg-blue-500/60"
          initial={{ width: '0%' }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      )}

      {/* Card content */}
      <div className="px-3 py-2.5">
        <div className="flex items-start gap-2">
          <div className="mt-1 shrink-0">
            <CardStatusDot status={card.status} />
          </div>
          <span className="flex-1 min-w-0 text-[13px] font-medium leading-snug text-[var(--kb-text)]">
            {card.title}
          </span>
          <div className="shrink-0">
            <PriorityBadge priority={card.priority} />
          </div>
        </div>

        {/* Description preview */}
        {card.description && (
          <p className="mt-1.5 ml-4 line-clamp-2 text-[11px] leading-relaxed text-[var(--kb-muted)]">
            {card.description}
          </p>
        )}

        {/* Metadata row */}
        {(card.subtasks.length > 0 || card.branch || card.prUrl) && (
          <div className="mt-2 ml-4 flex items-center gap-3 text-[10px] text-[var(--kb-dim)]">
            {card.subtasks.length > 0 && (
              <button
                onClick={handleExpandToggle}
                className="flex items-center gap-1 hover:text-[var(--kb-muted)] transition-colors"
              >
                <motion.span
                  animate={{ rotate: expanded ? 90 : 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  className="inline-block"
                >
                  ▸
                </motion.span>
                {card.subtasks.filter((s) => s.status === 'completed').length}/
                {card.subtasks.length} subtasks
              </button>
            )}
            {card.branch && (
              <span className="truncate max-w-[120px]" title={card.branch}>
                ⎇ {card.branch}
              </span>
            )}
            {card.prUrl && (
              <span className="text-emerald-400">
                PR #{card.prNumber}
              </span>
            )}
          </div>
        )}

        {/* Expandable subtask list */}
        <AnimatePresence>
          {expanded && card.subtasks.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="overflow-hidden"
            >
              <div className="mt-2 ml-4 space-y-0.5 border-t border-[var(--kb-border)] pt-2">
                {card.subtasks.map((st, i) => (
                  <motion.div
                    key={st.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.12, delay: i * 0.025 }}
                    className="flex items-center gap-2 py-0.5"
                  >
                    <SubtaskStatusDot status={st.status} />
                    <span className="text-[11px] text-[var(--kb-muted)]">
                      {st.title}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error message */}
        {card.error && (
          <p className="mt-1.5 ml-4 text-[11px] text-red-400 truncate">
            {card.error}
          </p>
        )}
      </div>
    </motion.div>
  );
}
