/**
 * CardDetail — slide-over panel showing full card information.
 *
 * Spring-physics slide-in from the right (matches Sero panel patterns).
 * Shows card metadata, subtask list, plan, error, and actions.
 */

import { useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Card, Column, Priority, KanbanState } from '../../shared/types';
import { COLUMNS, COLUMN_LABELS } from '../../shared/types';
import { CardStatusDot, SubtaskStatusDot } from './StatusDot';
import { PriorityBadge } from './PriorityBadge';

export function CardDetail({
  card,
  onClose,
  onUpdate,
}: {
  card: Card | null;
  onClose: () => void;
  onUpdate: (updater: (state: KanbanState) => KanbanState) => void;
}) {
  const handleMove = useCallback(
    (column: Column) => {
      if (!card) return;
      onUpdate((prev) => ({
        ...prev,
        cards: prev.cards.map((c) =>
          c.id === card.id
            ? {
                ...c,
                column,
                updatedAt: new Date().toISOString(),
                ...(column === 'done' && !c.completedAt
                  ? { completedAt: new Date().toISOString() }
                  : {}),
              }
            : c,
        ),
      }));
    },
    [card, onUpdate],
  );

  const handlePriorityChange = useCallback(
    (priority: Priority) => {
      if (!card) return;
      onUpdate((prev) => ({
        ...prev,
        cards: prev.cards.map((c) =>
          c.id === card.id
            ? { ...c, priority, updatedAt: new Date().toISOString() }
            : c,
        ),
      }));
    },
    [card, onUpdate],
  );

  const handleDelete = useCallback(() => {
    if (!card) return;
    onUpdate((prev) => ({
      ...prev,
      cards: prev.cards.filter((c) => c.id !== card.id),
    }));
    onClose();
  }, [card, onUpdate, onClose]);

  return (
    <AnimatePresence>
      {card && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/30"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 z-50 flex h-full w-[400px] flex-col border-l border-[var(--kb-border)] bg-[var(--kb-bg)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--kb-border)] px-4 py-3">
              <div className="flex items-center gap-2">
                <CardStatusDot status={card.status} />
                <span className="text-xs font-medium text-[var(--kb-dim)]">
                  #{card.id}
                </span>
              </div>
              <button
                onClick={onClose}
                className="rounded-md p-1 text-[var(--kb-dim)] transition-colors hover:bg-[var(--kb-elevated)] hover:text-[var(--kb-text)]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Title */}
              <h2 className="text-lg font-medium text-[var(--kb-text)]">
                {card.title}
              </h2>

              {/* Priority + Column */}
              <div className="flex items-center gap-3">
                <PriorityBadge priority={card.priority} />
                <span className="text-xs text-[var(--kb-muted)]">
                  {COLUMN_LABELS[card.column]}
                </span>
              </div>

              {/* Description */}
              {card.description && (
                <div>
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--kb-dim)]">
                    Description
                  </h3>
                  <p className="text-sm leading-relaxed text-[var(--kb-muted)]">
                    {card.description}
                  </p>
                </div>
              )}

              {/* Acceptance criteria */}
              {card.acceptance.length > 0 && (
                <div>
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--kb-dim)]">
                    Acceptance Criteria
                  </h3>
                  <ul className="space-y-1">
                    {card.acceptance.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-[var(--kb-muted)]">
                        <span className="mt-1 text-[var(--kb-dim)]">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Plan */}
              {card.plan && (
                <div>
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--kb-dim)]">
                    Plan
                  </h3>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--kb-muted)]">
                    {card.plan}
                  </p>
                </div>
              )}

              {/* Subtasks */}
              {card.subtasks.length > 0 && (
                <div>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--kb-dim)]">
                    Subtasks ({card.subtasks.filter((s) => s.status === 'completed').length}/{card.subtasks.length})
                  </h3>
                  <div className="space-y-1">
                    {card.subtasks.map((st, i) => (
                      <motion.div
                        key={st.id}
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.12, delay: i * 0.025 }}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--kb-elevated)]"
                      >
                        <SubtaskStatusDot status={st.status} />
                        <span className="flex-1 text-xs text-[var(--kb-muted)]">
                          {st.title}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Git info */}
              {(card.branch || card.prUrl) && (
                <div>
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--kb-dim)]">
                    Version Control
                  </h3>
                  <div className="space-y-1 text-xs text-[var(--kb-muted)]">
                    {card.branch && <p>Branch: <code className="text-[var(--kb-accent)]">{card.branch}</code></p>}
                    {card.prUrl && (
                      <p>
                        PR: <span className="text-emerald-400">#{card.prNumber}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Error */}
              {card.error && (
                <div className="rounded-md border border-red-500/20 bg-red-500/[0.03] p-3">
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-red-400">
                    Error
                  </h3>
                  <p className="text-xs text-red-300">{card.error}</p>
                </div>
              )}
            </div>

            {/* Actions footer */}
            <div className="border-t border-[var(--kb-border)] p-3 space-y-2">
              {/* Move to column */}
              <div className="flex flex-wrap gap-1">
                {COLUMNS.filter((c) => c !== card.column).map((col) => (
                  <button
                    key={col}
                    onClick={() => handleMove(col)}
                    className="rounded-md bg-[var(--kb-elevated)] px-2 py-1 text-[11px] text-[var(--kb-muted)] transition-colors hover:bg-[var(--kb-surface)] hover:text-[var(--kb-text)]"
                  >
                    → {COLUMN_LABELS[col]}
                  </button>
                ))}
              </div>

              {/* Priority + Delete */}
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {(['critical', 'high', 'medium', 'low'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => handlePriorityChange(p)}
                      className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                        card.priority === p
                          ? 'bg-[var(--kb-accent)]/20 text-[var(--kb-accent)]'
                          : 'text-[var(--kb-dim)] hover:text-[var(--kb-muted)]'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleDelete}
                  className="rounded-md px-2 py-1 text-[11px] text-red-400 transition-colors hover:bg-red-500/10"
                >
                  Delete
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
