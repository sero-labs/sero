/**
 * KanbanWidget — compact board overview for the dashboard.
 *
 * Shows column swim lanes with card counts, a priority distribution
 * bar, and animated status indicators for active cards.
 */

import { useMemo } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import { motion } from 'motion/react';
import type { KanbanState, Column, Card, Priority } from '../../shared/types';
import { COLUMNS, COLUMN_LABELS, DEFAULT_KANBAN_STATE } from '../../shared/types';

// ── Priority colors ──────────────────────────────────────────────

const PRIORITY_COLORS: Record<Priority, string> = {
  critical: '#dc2626',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
};

const STATUS_GLOW: Record<string, string> = {
  'agent-working': 'rgba(59, 130, 246, 0.5)',
  'waiting-input': 'rgba(245, 158, 11, 0.5)',
  failed: 'rgba(220, 38, 38, 0.5)',
};

const COLUMN_COLORS: Record<Column, string> = {
  backlog: '#6b7280',
  planning: '#8b5cf6',
  'in-progress': '#3b82f6',
  review: '#f59e0b',
  done: '#22c55e',
};

// ── Component ────────────────────────────────────────────────────

export function KanbanWidget() {
  const [state] = useAppState<KanbanState>(DEFAULT_KANBAN_STATE);

  const stats = useMemo(() => {
    const byColumn = new Map<Column, Card[]>();
    for (const col of COLUMNS) byColumn.set(col, []);
    for (const card of state.cards) {
      byColumn.get(card.column)?.push(card);
    }

    const priorityCounts: Record<Priority, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    let activeCount = 0;
    for (const card of state.cards) {
      priorityCounts[card.priority] += 1;
      if (card.status === 'agent-working') activeCount += 1;
    }

    return { byColumn, priorityCounts, activeCount, total: state.cards.length };
  }, [state.cards]);

  if (stats.total === 0) {
    return <EmptyBoard />;
  }

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      {/* ── Stats row ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tabular-nums text-[var(--text-primary)]">
            {stats.total}
          </span>
          <span className="text-xs text-[var(--text-muted)]">cards</span>
        </div>
        {stats.activeCount > 0 && (
          <motion.div
            className="flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2 py-0.5"
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <div className="size-1.5 rounded-full bg-blue-500" />
            <span className="text-[10px] font-medium text-blue-400">
              {stats.activeCount} active
            </span>
          </motion.div>
        )}
      </div>

      {/* ── Column swim lanes ── */}
      <div className="flex flex-1 gap-1">
        {COLUMNS.map((col) => {
          const cards = stats.byColumn.get(col) ?? [];
          const maxHeight = Math.max(stats.total, 1);
          const fillPct = (cards.length / maxHeight) * 100;

          return (
            <div key={col} className="flex flex-1 flex-col items-center gap-1">
              <div className="relative flex w-full flex-1 flex-col-reverse overflow-hidden rounded-md bg-[var(--bg-elevated)]">
                <motion.div
                  className="w-full rounded-md"
                  style={{ backgroundColor: COLUMN_COLORS[col] }}
                  initial={{ height: 0 }}
                  animate={{ height: `${fillPct}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
                {/* Card dots stacked inside */}
                <div className="absolute inset-0 flex flex-col-reverse items-center justify-start gap-0.5 p-1">
                  {cards.slice(0, 5).map((card) => (
                    <motion.div
                      key={card.id}
                      className="size-2.5 rounded-sm"
                      style={{
                        backgroundColor: PRIORITY_COLORS[card.priority],
                        boxShadow: STATUS_GLOW[card.status]
                          ? `0 0 6px ${STATUS_GLOW[card.status]}`
                          : undefined,
                      }}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: Math.random() * 0.3 }}
                      title={card.title}
                    />
                  ))}
                  {cards.length > 5 && (
                    <span className="text-[8px] font-bold text-[var(--text-muted)]">
                      +{cards.length - 5}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-semibold tabular-nums text-[var(--text-primary)]">
                  {cards.length}
                </span>
                <span className="max-w-full truncate text-[8px] text-[var(--text-muted)]">
                  {COLUMN_LABELS[col]}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Priority distribution bar ── */}
      <PriorityBar counts={stats.priorityCounts} total={stats.total} />
    </div>
  );
}

// ── Priority bar ─────────────────────────────────────────────────

function PriorityBar({ counts, total }: { counts: Record<Priority, number>; total: number }) {
  const priorities: Priority[] = ['critical', 'high', 'medium', 'low'];

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
        {priorities.map((p) => {
          const pct = total > 0 ? (counts[p] / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <motion.div
              key={p}
              className="h-full"
              style={{ backgroundColor: PRIORITY_COLORS[p] }}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          );
        })}
      </div>
      <div className="flex gap-1.5">
        {priorities.map((p) => (
          counts[p] > 0 && (
            <div key={p} className="flex items-center gap-0.5">
              <div className="size-1.5 rounded-full" style={{ backgroundColor: PRIORITY_COLORS[p] }} />
              <span className="text-[9px] tabular-nums text-[var(--text-muted)]">{counts[p]}</span>
            </div>
          )
        ))}
      </div>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────

function EmptyBoard() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-3">
      <motion.div
        className="size-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20"
        animate={{ scale: [1, 1.05, 1], rotate: [0, 2, -2, 0] }}
        transition={{ duration: 3, repeat: Infinity }}
      />
      <span className="text-xs text-[var(--text-muted)]">No cards yet</span>
    </div>
  );
}

export default KanbanWidget;