/**
 * KanbanApp — Sero web UI for the Kanban dev board.
 *
 * Uses useAppState from @sero-ai/app-runtime to read/write the same
 * state.json file the Pi extension writes. Changes from either
 * direction are reflected instantly via file watching.
 *
 * Design: full-width swim-lane board with equal-flex columns,
 * DM Sans typography, indigo accents matching Sero design system.
 */

import { useState, useCallback, useContext, useMemo } from 'react';
import { motion } from 'motion/react';
import { AppContext, useAppState, useAgentPrompt } from '@sero-ai/app-runtime';
import type { KanbanState, Card, Column, Priority } from '../shared/types';
import {
  DEFAULT_KANBAN_STATE,
  COLUMNS,
  COLUMN_LABELS,
  PRIORITY_ORDER,
  createCard,
} from '../shared/types';
import { applyManualMove } from './lib/card-workflow';
import { ColumnView } from './components/ColumnView';
import { CardDetail } from './components/CardDetail';
import { SettingsPanel } from './components/SettingsPanel';
import { useErrorLogSummary } from './hooks/useErrorLogSummary';

// ── Styles ───────────────────────────────────────────────────

const CUSTOM_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300;1,9..40,400&display=swap');

  .kb-root {
    --kb-bg: #0f1117;
    --kb-surface: #1e2029;
    --kb-elevated: #22252f;
    --kb-text: #e8e4df;
    --kb-muted: #8b8d97;
    --kb-dim: #5c5e6a;
    --kb-accent: #818cf8;
    --kb-accent-hover: #a5b4fc;
    --kb-accent-glow: rgba(129, 140, 248, 0.12);
    --kb-border: rgba(255, 255, 255, 0.07);

    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
    background: var(--kb-bg);
    color: var(--kb-text);
  }

  @supports (color: var(--bg-base)) {
    .kb-root {
      --kb-bg: var(--bg-base, #0f1117);
      --kb-surface: var(--bg-surface, #1e2029);
      --kb-elevated: var(--bg-elevated, #22252f);
      --kb-text: var(--text-primary, #e8e4df);
      --kb-border: var(--border, rgba(255, 255, 255, 0.07));
    }
  }

  .kb-root h1, .kb-root h2, .kb-root h3 {
    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
  }

  .kb-col-drop-active {
    background: rgba(129, 140, 248, 0.04) !important;
    border-color: rgba(129, 140, 248, 0.15) !important;
  }

  .kb-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .kb-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .kb-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.08);
    border-radius: 4px;
  }
  .kb-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.14);
  }

  @keyframes kb-pulse {
    0%, 100% { transform: scale(1); opacity: 0.15; }
    50% { transform: scale(1.08); opacity: 0.25; }
  }

  .kb-empty-orb {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 40%, var(--kb-accent) 0%, transparent 70%);
    opacity: 0.15;
    animation: kb-pulse 3s ease-in-out infinite;
  }
`;

// ── KanbanApp ──────────────────────────────────────────────────

export function KanbanApp() {
  const appContext = useContext(AppContext);
  const [state, updateState] = useAppState<KanbanState>(DEFAULT_KANBAN_STATE);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const yoloEnabled = state.settings.yoloMode === true;
  const errorSummary = useErrorLogSummary(appContext?.stateFilePath ?? '');

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
    (title: string, priority: Priority, column: Column = 'backlog') => {
      updateState((prev) => {
        const id = String(prev.nextId);
        const card = createCard(id, title, { priority });
        card.column = column;
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
      updateState((prev) => {
        const card = prev.cards.find((entry) => entry.id === cardId);
        if (!card || card.column === toColumn) return prev;
        return applyManualMove(prev, cardId, toColumn);
      });
    },
    [updateState],
  );

  const handleSelectCard = useCallback((card: Card) => {
    setSelectedCard(card);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedCard(null);
  }, []);

  // Agent actions — send commands via ChatPanel
  const promptAgent = useAgentPrompt();
  const handleBrainstorm = useCallback(() => {
    promptAgent('/brainstorm');
  }, [promptAgent]);

  const handleRetrospective = useCallback(() => {
    promptAgent('Using the kanban tool: retrospective');
  }, [promptAgent]);

  // Error badge follows the persisted error log, not transient card state.
  const hasErrors = errorSummary.count > 0;

  // Summary stats
  const totalCards = state.cards.length;
  const activeCards = state.cards.filter(
    (c) => c.column === 'in-progress',
  ).length;
  const doneCards = state.cards.filter((c) => c.column === 'done').length;

  return (
    <>
      <style>{CUSTOM_STYLES}</style>
      <div className="kb-root relative flex h-full w-full flex-col overflow-hidden">
        {/* Header bar */}
        <div className="shrink-0 flex items-center justify-between px-6 py-3.5 border-b border-[var(--kb-border)]">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-medium tracking-tight text-[var(--kb-text)]">
              Kanban
            </h1>
            {totalCards > 0 && (
              <div className="flex items-center gap-2 ml-3 pl-3 border-l border-[var(--kb-border)]">
                <Stat label="total" value={totalCards} />
                <span className="text-[10px] text-[var(--kb-dim)]">·</span>
                <Stat label="active" value={activeCards} color="text-blue-400" />
                <span className="text-[10px] text-[var(--kb-dim)]">·</span>
                <Stat label="done" value={doneCards} color="text-emerald-400" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* YOLO indicator (read-only badge when enabled) */}
            {yoloEnabled && (
              <span className="px-2 py-1 text-[11px] font-medium rounded-md
                bg-red-500/15 text-red-400 border border-red-500/30">
                🔥 YOLO
              </span>
            )}
            <button
              onClick={handleRetrospective}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border cursor-pointer
                transition-colors duration-150
                ${hasErrors
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                  : 'bg-[var(--kb-accent-glow)] text-[var(--kb-muted)] border-[var(--kb-border)] hover:text-[var(--kb-accent)] hover:border-[var(--kb-accent)]'}`}
              title="Analyze errors and failures across the board, and suggest process improvements"
            >
              Retrospective{hasErrors ? ' !' : ''}
            </button>
            <button
              onClick={handleBrainstorm}
              className="px-3 py-1.5 text-xs font-medium rounded-md
                bg-[var(--kb-accent-glow)] text-[var(--kb-accent)] border border-[var(--kb-border)]
                hover:bg-[var(--kb-accent)] hover:text-white
                transition-colors duration-150 cursor-pointer"
            >
              Brainstorm
            </button>
            {/* Settings gear */}
            <button
              onClick={() => setSettingsOpen(true)}
              className="w-8 h-8 flex items-center justify-center rounded-md
                text-[var(--kb-muted)] hover:text-[var(--kb-text)] hover:bg-white/[0.05]
                transition-colors cursor-pointer"
              title="Board settings"
            >
              <SettingsGearIcon />
            </button>
          </div>
        </div>

        {/* Board — columns flex to fill all available space */}
        {totalCards === 0 ? (
          <EmptyState onAddCard={handleAddCard} />
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {COLUMNS.map((col) => (
              <ColumnView
                key={col}
                column={col}
                cards={cardsByColumn[col]}
                onReorder={handleReorder}
                onSelectCard={handleSelectCard}
                onDropCard={handleDropCard}
                onAddCard={handleAddCard}
              />
            ))}
          </div>
        )}

        {/* Card detail panel */}
        <CardDetail
          card={activeSelectedCard}
          onClose={handleCloseDetail}
          onUpdate={updateState}
        />

        {/* Settings panel */}
        <SettingsPanel
          open={settingsOpen}
          settings={state.settings}
          onClose={() => setSettingsOpen(false)}
          onUpdate={updateState}
        />
      </div>
    </>
  );
}

// ── Stat pill ──────────────────────────────────────────────

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className={`font-medium tabular-nums ${color || 'text-[var(--kb-text)]'}`}>
        {value}
      </span>
      <span className="text-[var(--kb-dim)]">{label}</span>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────

function EmptyState({ onAddCard }: { onAddCard: (title: string, priority: Priority, column?: Column) => void }) {
  const [title, setTitle] = useState('');

  return (
    <div className="flex flex-1 items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="flex flex-col items-center text-center max-w-[320px]"
      >
        <div className="kb-empty-orb mb-5" />
        <h2 className="text-lg font-medium text-[var(--kb-text)]">
          No cards yet
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--kb-muted)]">
          Add your first card to get started, or ask the agent to create tasks for you.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = title.trim();
            if (!trimmed) return;
            onAddCard(trimmed, 'medium');
            setTitle('');
          }}
          className="mt-5 flex w-full gap-2"
        >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs building?"
            className="flex-1 rounded-lg border border-[var(--kb-border)] bg-[var(--kb-elevated)] px-3 py-2 text-sm text-[var(--kb-text)] placeholder-[var(--kb-dim)] outline-none transition-colors focus:border-[var(--kb-accent)]"
          />
          <button
            type="submit"
            disabled={!title.trim()}
            className="rounded-lg border border-indigo-400/30 bg-indigo-400/10 px-4 py-2 text-sm font-medium text-[var(--kb-accent)] transition-all hover:bg-indigo-400/[0.15] disabled:opacity-30 disabled:cursor-default"
          >
            Add
          </button>
        </form>
      </motion.div>
    </div>
  );
}

// ── Settings gear icon ──────────────────────────────────────

function SettingsGearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.86 2.07a1.1 1.1 0 0 1 2.28 0 1.1 1.1 0 0 0 1.64.68 1.1 1.1 0 0 1 1.62 1.13 1.1 1.1 0 0 0 .96 1.42 1.1 1.1 0 0 1 .57 2.17 1.1 1.1 0 0 0-.2 1.7 1.1 1.1 0 0 1-.82 1.96 1.1 1.1 0 0 0-1.2 1.05 1.1 1.1 0 0 1-1.97.82 1.1 1.1 0 0 0-1.7.2 1.1 1.1 0 0 1-2.17-.57 1.1 1.1 0 0 0-1.42-.96 1.1 1.1 0 0 1-1.13-1.62 1.1 1.1 0 0 0-.68-1.64 1.1 1.1 0 0 1 0-2.28 1.1 1.1 0 0 0 .68-1.64A1.1 1.1 0 0 1 4.3 3.3a1.1 1.1 0 0 0 1.42-.96 1.1 1.1 0 0 1 .14-.27Z" />
      <circle cx="8" cy="8" r="2.2" />
    </svg>
  );
}

export default KanbanApp;
