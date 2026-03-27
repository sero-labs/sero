/**
 * ColumnView — a single swim-lane column that stretches to fill
 * its share of the board width (flex-1).
 *
 * Uses HTML5 drag/drop for cross-column moves, Reorder.Group
 * for within-column reordering, AnimatePresence for card transitions.
 */

import { useState, useCallback, useRef } from 'react';
import { AnimatePresence, Reorder, motion } from 'motion/react';
import type { Card, Column, Priority } from '../../shared/types';
import { COLUMN_LABELS } from '../../shared/types';
import { CardView } from './CardView';

const COLUMN_ACCENT: Record<Column, string> = {
  backlog: '#71717a',    // zinc
  planning: '#8b5cf6',   // violet
  'in-progress': '#3b82f6', // blue
  review: '#f59e0b',     // amber
  done: '#10b981',       // emerald
};

export function ColumnView({
  column,
  cards,
  onReorder,
  onSelectCard,
  onDropCard,
  onAddCard,
}: {
  column: Column;
  cards: Card[];
  onReorder: (column: Column, cards: Card[]) => void;
  onSelectCard: (card: Card) => void;
  onDropCard: (cardId: string, toColumn: Column) => void;
  onAddCard: (title: string, priority: Priority, column: Column) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCountRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current++;
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCountRef.current--;
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0;
      setDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCountRef.current = 0;
      setDragOver(false);
      const cardId = e.dataTransfer.getData('text/plain');
      if (cardId) onDropCard(cardId, column);
    },
    [column, onDropCard],
  );

  const handleAddSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = newTitle.trim();
      if (!trimmed) return;
      onAddCard(trimmed, 'medium', column);
      setNewTitle('');
      inputRef.current?.focus();
    },
    [newTitle, column, onAddCard],
  );

  const accentColor = COLUMN_ACCENT[column];
  const isLast = column === 'done';

  return (
    <div
      className={`flex flex-1 min-w-0 flex-col ${!isLast ? 'border-r border-[var(--kb-border)]' : ''}`}
      style={{
        background: dragOver ? 'rgba(129, 140, 248, 0.03)' : undefined,
        transition: 'background 0.15s',
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Column header */}
      <div className="shrink-0 flex items-center gap-2.5 px-4 py-3">
        <span
          className="size-2 rounded-full shrink-0"
          style={{ backgroundColor: accentColor }}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--kb-muted)]">
          {COLUMN_LABELS[column]}
        </span>
        <motion.span
          key={cards.length}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="ml-auto text-[10px] font-medium tabular-nums text-[var(--kb-dim)]"
        >
          {cards.length}
        </motion.span>
      </div>

      {/* Cards area */}
      <div className="flex-1 overflow-y-auto kb-scrollbar px-3 pb-2">
        {cards.length > 0 ? (
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
        ) : (
          <div className="flex items-center justify-center py-10 text-[11px] text-[var(--kb-dim)]">
            {dragOver ? 'Drop here' : 'No cards'}
          </div>
        )}
      </div>

      {/* Add card — bottom of column */}
      <div className="shrink-0 px-3 py-3 border-t border-[var(--kb-border)]">
        <AnimatePresence mode="wait">
          {!adding ? (
            <motion.button
              key="trigger"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setAdding(true);
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
              className="w-full rounded-lg border border-dashed border-[var(--kb-border)] py-2 text-[11px] font-medium text-[var(--kb-dim)] transition-all hover:border-indigo-400/20 hover:bg-indigo-400/[0.04] hover:text-[var(--kb-muted)]"
            >
              + Add card
            </motion.button>
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.12 }}
              onSubmit={handleAddSubmit}
              className="flex gap-1.5"
            >
              <input
                ref={inputRef}
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setAdding(false);
                    setNewTitle('');
                  }
                }}
                onBlur={() => {
                  if (!newTitle.trim()) {
                    setAdding(false);
                    setNewTitle('');
                  }
                }}
                placeholder="Card title..."
                className="flex-1 min-w-0 rounded-md border border-[var(--kb-border)] bg-[var(--kb-elevated)] px-2 py-1.5 text-xs text-[var(--kb-text)] placeholder-[var(--kb-dim)] outline-none transition-colors focus:border-[var(--kb-accent)]"
              />
              <button
                type="submit"
                disabled={!newTitle.trim()}
                className="shrink-0 rounded-md border border-indigo-400/30 bg-indigo-400/10 px-2.5 py-1.5 text-[11px] font-medium text-[var(--kb-accent)] transition-all disabled:opacity-30"
              >
                Add
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
