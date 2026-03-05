/**
 * ColumnView — a single column on the board with its cards.
 *
 * Uses AnimatePresence for smooth card entry/exit and Reorder.Group
 * for drag-to-reorder within a column.
 */

import { AnimatePresence, Reorder, motion } from 'motion/react';
import type { Card, Column } from '../../shared/types';
import { COLUMN_LABELS } from '../../shared/types';
import { CardView } from './CardView';

const COLUMN_ACCENT: Record<Column, string> = {
  backlog: 'bg-zinc-500',
  planning: 'bg-violet-500',
  'in-progress': 'bg-blue-500',
  review: 'bg-amber-500',
  done: 'bg-emerald-500',
};

export function ColumnView({
  column,
  cards,
  onReorder,
  onSelectCard,
  onDropCard,
}: {
  column: Column;
  cards: Card[];
  onReorder: (column: Column, cards: Card[]) => void;
  onSelectCard: (card: Card) => void;
  onDropCard: (cardId: string, toColumn: Column) => void;
}) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('text/plain');
    if (cardId) {
      onDropCard(cardId, column);
    }
  };

  return (
    <div
      className="flex w-[260px] shrink-0 flex-col rounded-xl bg-[var(--kb-bg)]/60 border border-[var(--kb-border)]/50"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Column header */}
      <div className="flex items-center gap-2.5 px-3 py-3">
        <span className={`size-2 rounded-full ${COLUMN_ACCENT[column]}`} />
        <span className="text-xs font-semibold tracking-wide text-[var(--kb-text)]">
          {COLUMN_LABELS[column]}
        </span>
        <motion.span
          key={cards.length}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="ml-auto rounded-full bg-[var(--kb-elevated)] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--kb-dim)]"
        >
          {cards.length}
        </motion.span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <Reorder.Group
          axis="y"
          values={cards}
          onReorder={(newOrder) => onReorder(column, newOrder)}
          className="flex flex-col gap-1.5"
        >
          <AnimatePresence mode="popLayout">
            {cards.map((card) => (
              <Reorder.Item
                key={card.id}
                value={card}
                dragListener={false}
              >
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', card.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                >
                  <CardView card={card} onSelect={onSelectCard} />
                </div>
              </Reorder.Item>
            ))}
          </AnimatePresence>
        </Reorder.Group>

        {cards.length === 0 && (
          <div className="flex items-center justify-center py-8 text-[11px] text-[var(--kb-dim)]">
            No cards
          </div>
        )}
      </div>
    </div>
  );
}
