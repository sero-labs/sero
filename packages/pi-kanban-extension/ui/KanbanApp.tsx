/**
 * KanbanApp — Sero web UI for the Kanban dev board.
 *
 * Uses useAppState from @sero/app-runtime to read/write the same
 * state.json file the Pi extension writes. Changes from either
 * direction are reflected instantly via file watching.
 *
 * Design: follows ToolCallGroup.tsx patterns — state-driven borders,
 * motion/react animations, Sero design system CSS variables.
 */

import { useState, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import { useAppState } from '@sero/app-runtime';
import type { KanbanState, Card, Column, Priority } from '../shared/types';
import {
  DEFAULT_KANBAN_STATE,
  COLUMNS,
  COLUMN_LABELS,
  PRIORITY_ORDER,
  createCard,
} from '../shared/types';
import { ColumnView } from './components/ColumnView';
import { CardDetail } from './components/CardDetail';
import { AddCardForm } from './components/AddCardForm';

// ── Styles ───────────────────────────────────────────────────

const CUSTOM_STYLES = `
  .kb-root {
    --kb-bg: #0f1117;
    --kb-surface: #191b23;
    --kb-elevated: #22252f;
    --kb-text: #e8e4df;
    --kb-muted: #8b8d97;
    --kb-dim: #5c5e6a;
    --kb-accent: #818cf8;
    --kb-border: rgba(255, 255, 255, 0.07);

    font-family: system-ui, -apple-system, sans-serif;
    background: var(--kb-bg);
    color: var(--kb-text);
  }

  @supports (color: var(--bg-base)) {
    .kb-root {
      --kb-bg: var(--bg-base, #0f1117);
      --kb-surface: var(--bg-surface, #191b23);
      --kb-elevated: var(--bg-elevated, #22252f);
      --kb-text: var(--text-primary, #e8e4df);
      --kb-border: var(--border, rgba(255, 255, 255, 0.07));
    }
  }
`;

// ── KanbanApp ──────────────────────────────────────────────────

export function KanbanApp() {
  const [state, updateState] = useAppState<KanbanState>(DEFAULT_KANBAN_STATE);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  // Group cards by column, sorted by priority
  const cardsByColumn = useMemo(() => {
    const map: Record<Column, Card[]> = {
      backlog: [],
      planning: [],
      'in-progress': [],
      review: [],
      done: [],
    };
    for (const card of state.cards) {
      map[card.column]?.push(card);
    }
    // Sort each column by priority
    for (const col of COLUMNS) {
      map[col].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    }
    return map;
  }, [state.cards]);

  // Keep selectedCard in sync with state
  const activeSelectedCard = useMemo(() => {
    if (!selectedCard) return null;
    return state.cards.find((c) => c.id === selectedCard.id) ?? null;
  }, [selectedCard, state.cards]);

  const handleAddCard = useCallback(
    (title: string, priority: Priority) => {
      updateState((prev) => {
        const id = String(prev.nextId);
        const card = createCard(id, title, { priority });
        return {
          ...prev,
          cards: [...prev.cards, card],
          nextId: prev.nextId + 1,
        };
      });
    },
    [updateState],
  );

  const handleReorder = useCallback(
    (column: Column, newCards: Card[]) => {
      updateState((prev) => ({
        ...prev,
        cards: [
          ...prev.cards.filter((c) => c.column !== column),
          ...newCards,
        ],
      }));
    },
    [updateState],
  );

  const handleDropCard = useCallback(
    (cardId: string, toColumn: Column) => {
      updateState((prev) => ({
        ...prev,
        cards: prev.cards.map((c) =>
          c.id === cardId
            ? {
                ...c,
                column: toColumn,
                updatedAt: new Date().toISOString(),
                ...(toColumn === 'done' && !c.completedAt
                  ? { completedAt: new Date().toISOString() }
                  : {}),
              }
            : c,
        ),
      }));
    },
    [updateState],
  );

  const handleSelectCard = useCallback((card: Card) => {
    setSelectedCard(card);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedCard(null);
  }, []);

  // Summary stats
  const totalCards = state.cards.length;
  const activeCards = state.cards.filter(
    (c) => c.column === 'in-progress' || c.column === 'planning',
  ).length;
  const doneCards = state.cards.filter((c) => c.column === 'done').length;

  return (
    <>
      <style>{CUSTOM_STYLES}</style>
      <div className="kb-root flex h-full w-full flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-[var(--kb-border)] px-4 py-3">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold text-[var(--kb-text)]">
              Kanban
            </h1>
            {totalCards > 0 && (
              <div className="flex items-center gap-2 text-[11px] text-[var(--kb-dim)]">
                <span>{totalCards} cards</span>
                <span>·</span>
                <span className="text-blue-400">{activeCards} active</span>
                <span>·</span>
                <span className="text-emerald-400">{doneCards} done</span>
              </div>
            )}
          </div>
        </div>

        {/* Board */}
        <motion.div
          layout
          className="flex flex-1 gap-3 overflow-x-auto overflow-y-hidden p-3"
        >
          {COLUMNS.map((col) => (
            <div key={col} className="flex flex-col">
              <ColumnView
                column={col}
                cards={cardsByColumn[col]}
                onReorder={handleReorder}
                onSelectCard={handleSelectCard}
                onDropCard={handleDropCard}
              />
              {col === 'backlog' && (
                <AddCardForm onAdd={handleAddCard} />
              )}
            </div>
          ))}
        </motion.div>

        {/* Empty state */}
        {totalCards === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="text-center"
            >
              <div className="mx-auto mb-4 size-14 rounded-full bg-[var(--kb-accent)]/10 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--kb-accent)" strokeWidth={1.5} opacity={0.6}>
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </div>
              <p className="text-sm text-[var(--kb-muted)]">
                No cards yet
              </p>
              <p className="mt-1 text-xs text-[var(--kb-dim)]">
                Add a card to the backlog or ask the agent to create one
              </p>
            </motion.div>
          </div>
        )}

        {/* Card detail panel */}
        <CardDetail
          card={activeSelectedCard}
          onClose={handleCloseDetail}
          onUpdate={updateState}
        />
      </div>
    </>
  );
}

export default KanbanApp;
