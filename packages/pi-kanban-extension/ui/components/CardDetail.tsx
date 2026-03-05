/**
 * CardDetail — slide-over panel showing full card information.
 *
 * Uses absolute positioning within the kb-root container so it
 * doesn't escape the app bounds. Solid background, spring animation.
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
          {/* Backdrop — absolute within kb-root */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-40 bg-black/40"
            onClick={onClose}
          />

          {/* Panel — absolute within kb-root, solid background */}
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="absolute right-0 top-0 bottom-0 z-50 flex w-[400px] max-w-[85%] flex-col border-l border-[var(--kb-border)]"
            style={{ backgroundColor: 'var(--kb-bg)' }}
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between border-b border-[var(--kb-border)] px-5 py-3">
              <div className="flex items-center gap-2.5">
                <CardStatusDot status={card.status} />
                <span className="text-xs font-medium text-[var(--kb-dim)]">
                  #{card.id}
                </span>
                <span className="text-[10px] text-[var(--kb-dim)]">·</span>
                <span className="text-xs text-[var(--kb-muted)]">
                  {COLUMN_LABELS[card.column]}
                </span>
              </div>
              <button
                onClick={onClose}
                className="rounded-md p-1.5 text-[var(--kb-dim)] transition-colors hover:bg-[var(--kb-elevated)] hover:text-[var(--kb-text)]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto kb-scrollbar px-5 py-5 space-y-5">
              {/* Title */}
              <h2 className="text-lg font-medium leading-snug text-[var(--kb-text)]">
                {card.title}
              </h2>

              {/* Priority */}
              <div className="flex items-center gap-2">
                <PriorityBadge priority={card.priority} />
              </div>

              {/* Description */}
              {card.description && (
                <Section title="Description">
                  <p className="text-sm leading-relaxed text-[var(--kb-muted)]">
                    {card.description}
                  </p>
                </Section>
              )}

              {/* Acceptance criteria */}
              {card.acceptance.length > 0 && (
                <Section title="Acceptance Criteria">
                  <ul className="space-y-1.5">
                    {card.acceptance.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-[var(--kb-muted)]">
                        <span className="mt-0.5 text-[var(--kb-dim)]">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {/* Plan */}
              {card.plan && (
                <Section title="Plan">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--kb-muted)]">
                    {card.plan}
                  </p>
                </Section>
              )}

              {/* Subtasks */}
              {card.subtasks.length > 0 && (
                <Section title={`Subtasks (${card.subtasks.filter((s) => s.status === 'completed').length}/${card.subtasks.length})`}>
                  {/* Subtask progress bar */}
                  <div className="mb-3 h-1 rounded-full bg-[var(--kb-elevated)] overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-[var(--kb-accent)]"
                      initial={{ width: 0 }}
                      animate={{
                        width: `${(card.subtasks.filter((s) => s.status === 'completed').length / card.subtasks.length) * 100}%`,
                      }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <div className="space-y-1">
                    {card.subtasks.map((st, i) => (
                      <motion.div
                        key={st.id}
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.12, delay: i * 0.025 }}
                        className="flex items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors hover:bg-[var(--kb-elevated)]"
                      >
                        <SubtaskStatusDot status={st.status} />
                        <span className={`flex-1 text-xs ${st.status === 'completed' ? 'text-[var(--kb-dim)] line-through' : 'text-[var(--kb-muted)]'}`}>
                          {st.title}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Git info */}
              {(card.branch || card.prUrl) && (
                <Section title="Version Control">
                  <div className="space-y-1.5 text-sm text-[var(--kb-muted)]">
                    {card.branch && (
                      <p>
                        Branch: <code className="rounded bg-[var(--kb-elevated)] px-1.5 py-0.5 text-xs text-[var(--kb-accent)]">{card.branch}</code>
                      </p>
                    )}
                    {card.prUrl && (
                      <p>
                        PR: <span className="text-emerald-400 font-medium">#{card.prNumber}</span>
                      </p>
                    )}
                  </div>
                </Section>
              )}

              {/* Error */}
              {card.error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] p-3.5">
                  <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-red-400">
                    Error
                  </h3>
                  <p className="text-xs leading-relaxed text-red-300">{card.error}</p>
                </div>
              )}
            </div>

            {/* Actions footer */}
            <div className="shrink-0 border-t border-[var(--kb-border)] px-5 py-4 space-y-3">
              {/* Move to column */}
              <div>
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-[var(--kb-dim)]">
                  Move to
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {COLUMNS.filter((c) => c !== card.column).map((col) => (
                    <button
                      key={col}
                      onClick={() => handleMove(col)}
                      className="rounded-md border border-[var(--kb-border)] bg-[var(--kb-surface)] px-2.5 py-1.5 text-[11px] text-[var(--kb-muted)] transition-all hover:border-[var(--kb-accent)]/30 hover:text-[var(--kb-text)]"
                    >
                      {COLUMN_LABELS[col]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Priority + Delete */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex gap-1">
                  {(['critical', 'high', 'medium', 'low'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => handlePriorityChange(p)}
                      className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                        card.priority === p
                          ? 'bg-[var(--kb-accent)]/15 text-[var(--kb-accent)]'
                          : 'text-[var(--kb-dim)] hover:text-[var(--kb-muted)] hover:bg-[var(--kb-elevated)]'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleDelete}
                  className="rounded-md px-2.5 py-1 text-[11px] text-red-400/70 transition-colors hover:bg-red-500/10 hover:text-red-400"
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--kb-dim)]">
        {title}
      </h3>
      {children}
    </div>
  );
}
