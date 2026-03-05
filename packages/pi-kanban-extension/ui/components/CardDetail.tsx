/**
 * CardDetail — slide-over panel showing full card information.
 *
 * Uses absolute positioning within the kb-root container so it
 * doesn't escape the app bounds. Elevated surface background to
 * clearly differentiate from the board.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Card, Column, Priority, KanbanState, PlanningProgress, PlanningToolEntry } from '../../shared/types';
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

  const handleStartPlanning = useCallback(() => {
    if (!card) return;
    onUpdate((prev) => ({
      ...prev,
      cards: prev.cards.map((c) =>
        c.id === card.id
          ? {
              ...c,
              column: 'planning' as Column,
              status: 'agent-working' as const,
              updatedAt: new Date().toISOString(),
            }
          : c,
      ),
    }));
  }, [card, onUpdate]);

  const handleApprovePlan = useCallback(() => {
    if (!card) return;
    onUpdate((prev) => ({
      ...prev,
      cards: prev.cards.map((c) =>
        c.id === card.id
          ? {
              ...c,
              column: 'in-progress' as Column,
              status: 'idle' as const,
              updatedAt: new Date().toISOString(),
            }
          : c,
      ),
    }));
  }, [card, onUpdate]);

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
            className="absolute inset-0 z-40"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="absolute right-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden"
            style={{
              width: '400px',
              maxWidth: '85%',
              backgroundColor: '#1e2029',
              borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            {/* Header */}
            <div
              className="shrink-0 flex items-center justify-between"
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div className="flex items-center gap-2.5">
                <CardStatusDot status={card.status} />
                <span className="text-xs font-medium" style={{ color: '#5c5e6a' }}>
                  #{card.id}
                </span>
                <span className="text-[10px]" style={{ color: '#5c5e6a' }}>·</span>
                <span className="text-xs" style={{ color: '#8b8d97' }}>
                  {COLUMN_LABELS[card.column]}
                </span>
              </div>
              <button
                onClick={onClose}
                className="rounded-md transition-colors"
                style={{ padding: '6px', color: '#5c5e6a' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable content */}
            <div
              className="flex-1 overflow-y-auto kb-scrollbar"
              style={{ padding: '24px 20px' }}
            >
              {/* Title */}
              <h2
                className="font-medium leading-snug"
                style={{ fontSize: '18px', color: '#e8e4df', marginBottom: '16px' }}
              >
                {card.title}
              </h2>

              {/* Priority */}
              <div style={{ marginBottom: '20px' }}>
                <PriorityBadge priority={card.priority} />
              </div>

              {/* Description */}
              {card.description && (
                <div style={{ marginBottom: '20px' }}>
                  <SectionTitle>Description</SectionTitle>
                  <p className="text-sm leading-relaxed" style={{ color: '#8b8d97' }}>
                    {card.description}
                  </p>
                </div>
              )}

              {/* Acceptance criteria */}
              {card.acceptance.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <SectionTitle>Acceptance Criteria</SectionTitle>
                  <ul style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {card.acceptance.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#8b8d97' }}>
                        <span className="mt-0.5" style={{ color: '#5c5e6a' }}>•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Plan */}
              {card.plan && (
                <div style={{ marginBottom: '20px' }}>
                  <SectionTitle>Plan</SectionTitle>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: '#8b8d97' }}>
                    {card.plan}
                  </p>
                </div>
              )}

              {/* Subtasks */}
              {card.subtasks.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <SectionTitle>
                    Subtasks ({card.subtasks.filter((s) => s.status === 'completed').length}/{card.subtasks.length})
                  </SectionTitle>
                  {/* Progress bar */}
                  <div
                    style={{
                      height: '4px',
                      borderRadius: '2px',
                      backgroundColor: '#22252f',
                      overflow: 'hidden',
                      marginBottom: '12px',
                    }}
                  >
                    <motion.div
                      style={{
                        height: '100%',
                        borderRadius: '2px',
                        backgroundColor: '#818cf8',
                      }}
                      initial={{ width: 0 }}
                      animate={{
                        width: `${(card.subtasks.filter((s) => s.status === 'completed').length / card.subtasks.length) * 100}%`,
                      }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {card.subtasks.map((st, i) => (
                      <motion.div
                        key={st.id}
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.12, delay: i * 0.025 }}
                        className="flex items-center rounded-md"
                        style={{ gap: '10px', padding: '6px 10px' }}
                      >
                        <SubtaskStatusDot status={st.status} />
                        <span
                          className="flex-1 text-xs"
                          style={{
                            color: st.status === 'completed' ? '#5c5e6a' : '#8b8d97',
                            textDecoration: st.status === 'completed' ? 'line-through' : 'none',
                          }}
                        >
                          {st.title}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Git info */}
              {(card.branch || card.prUrl) && (
                <div style={{ marginBottom: '20px' }}>
                  <SectionTitle>Version Control</SectionTitle>
                  <div className="text-sm" style={{ color: '#8b8d97', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {card.branch && (
                      <p>
                        Branch:{' '}
                        <code
                          className="text-xs"
                          style={{
                            backgroundColor: '#22252f',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            color: '#818cf8',
                          }}
                        >
                          {card.branch}
                        </code>
                      </p>
                    )}
                    {card.prUrl && (
                      <p>
                        PR: <span className="font-medium" style={{ color: '#34d399' }}>#{card.prNumber}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Planning action buttons */}
              {card.column === 'backlog' && card.status === 'idle' && (
                <div style={{ marginBottom: '20px' }}>
                  <button
                    onClick={handleStartPlanning}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      borderRadius: '8px',
                      border: '1px solid rgba(129, 140, 248, 0.3)',
                      backgroundColor: 'rgba(129, 140, 248, 0.1)',
                      color: '#818cf8',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    Start Planning
                  </button>
                  <p style={{ fontSize: '11px', color: '#5c5e6a', marginTop: '6px', lineHeight: 1.4 }}>
                    Moves card to Planning and triggers automated codebase analysis and subtask generation.
                  </p>
                </div>
              )}

              {card.column === 'planning' && card.status === 'agent-working' && (
                <PlanningActivityPanel progress={card.planningProgress} />
              )}

              {card.column === 'planning' && card.status === 'waiting-input' && (
                <div style={{ marginBottom: '20px' }}>
                  <div
                    style={{
                      padding: '14px',
                      borderRadius: '8px',
                      border: '1px solid rgba(245, 158, 11, 0.2)',
                      backgroundColor: 'rgba(245, 158, 11, 0.04)',
                      marginBottom: '12px',
                    }}
                  >
                    <div className="flex items-center" style={{ gap: '10px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: '#f59e0b' }}>
                        Plan ready — awaiting approval
                      </span>
                    </div>
                    <p style={{ fontSize: '11px', color: '#5c5e6a', lineHeight: 1.4 }}>
                      Review the plan and subtasks below, then approve to advance to implementation.
                    </p>
                  </div>
                  <div className="flex" style={{ gap: '8px' }}>
                    <button
                      onClick={handleApprovePlan}
                      style={{
                        flex: 1,
                        padding: '10px 16px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: '#818cf8',
                        color: '#fff',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      Approve &amp; Start
                    </button>
                    <button
                      onClick={() => handleMove('backlog')}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        backgroundColor: 'transparent',
                        color: '#8b8d97',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}

              {/* Error */}
              {card.error && (
                <div
                  style={{
                    borderRadius: '8px',
                    border: '1px solid rgba(248, 113, 113, 0.2)',
                    backgroundColor: 'rgba(248, 113, 113, 0.04)',
                    padding: '14px',
                    marginBottom: '20px',
                  }}
                >
                  <h3
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: '#f87171',
                      marginBottom: '6px',
                    }}
                  >
                    Error
                  </h3>
                  <p className="text-xs leading-relaxed" style={{ color: '#fca5a5' }}>{card.error}</p>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div
              className="shrink-0"
              style={{
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '16px 20px',
              }}
            >
              {/* Move to */}
              <div style={{ marginBottom: '14px' }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: '10px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#5c5e6a',
                    marginBottom: '8px',
                  }}
                >
                  Move to
                </span>
                <div className="flex flex-wrap" style={{ gap: '6px' }}>
                  {COLUMNS.filter((c) => c !== card.column).map((col) => (
                    <button
                      key={col}
                      onClick={() => handleMove(col)}
                      className="rounded-md text-xs transition-all"
                      style={{
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        backgroundColor: '#22252f',
                        padding: '6px 12px',
                        color: '#8b8d97',
                      }}
                    >
                      {COLUMN_LABELS[col]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Priority + Delete */}
              <div className="flex items-center justify-between">
                <div className="flex" style={{ gap: '4px' }}>
                  {(['critical', 'high', 'medium', 'low'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => handlePriorityChange(p)}
                      className="rounded-md font-medium transition-colors"
                      style={{
                        fontSize: '10px',
                        padding: '4px 8px',
                        backgroundColor: card.priority === p ? 'rgba(129, 140, 248, 0.15)' : 'transparent',
                        color: card.priority === p ? '#818cf8' : '#5c5e6a',
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleDelete}
                  className="rounded-md transition-colors"
                  style={{
                    fontSize: '11px',
                    padding: '4px 10px',
                    color: 'rgba(248, 113, 113, 0.7)',
                  }}
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: '#5c5e6a',
        marginBottom: '8px',
      }}
    >
      {children}
    </h3>
  );
}

// ── Planning Activity Panel ─────────────────────────────────

const TOOL_ICONS: Record<string, string> = {
  read: '📖', bash: '📂', write: '✏️', edit: '✏️',
  ls: '📁', find: '🔍', grep: '🔎', glob: '🔍',
};

function toolIcon(name: string): string {
  return TOOL_ICONS[name] ?? '🔧';
}

function formatElapsed(startedAt: number): string {
  const ms = Date.now() - startedAt;
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  return `${Math.round(ms / 1000)}s`;
}

function PlanningActivityPanel({ progress }: { progress?: PlanningProgress }) {
  // Ticking elapsed timer
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    if (!progress?.startedAt) return;
    const tick = () => setElapsed(formatElapsed(progress.startedAt));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [progress?.startedAt]);

  // Auto-scroll the tool feed
  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [progress?.recentTools?.length]);

  return (
    <div
      style={{
        marginBottom: '20px',
        borderRadius: '8px',
        border: '1px solid rgba(59, 130, 246, 0.2)',
        backgroundColor: 'rgba(59, 130, 246, 0.04)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center"
        style={{ padding: '12px 14px', gap: '10px' }}
      >
        <span
          style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#3b82f6',
            animation: 'kb-pulse 2s ease-in-out infinite',
          }}
        />
        <span style={{ fontSize: '12px', fontWeight: 500, color: '#60a5fa', flex: 1 }}>
          {progress?.phase ?? 'Planning in progress…'}
        </span>
        {elapsed && (
          <span style={{ fontSize: '10px', color: '#5c5e6a', fontVariantNumeric: 'tabular-nums' }}>
            {elapsed}
          </span>
        )}
      </div>

      {/* Agent status pills */}
      {progress?.agents && progress.agents.length > 0 && (
        <div
          className="flex flex-wrap"
          style={{ padding: '0 14px 10px', gap: '6px' }}
        >
          {progress.agents.map((agent) => (
            <span
              key={agent.name}
              className="inline-flex items-center"
              style={{
                gap: '5px',
                fontSize: '10px',
                fontWeight: 500,
                padding: '3px 8px',
                borderRadius: '4px',
                backgroundColor:
                  agent.status === 'running'
                    ? 'rgba(59, 130, 246, 0.12)'
                    : agent.status === 'completed'
                      ? 'rgba(52, 211, 153, 0.12)'
                      : 'rgba(248, 113, 113, 0.12)',
                color:
                  agent.status === 'running'
                    ? '#60a5fa'
                    : agent.status === 'completed'
                      ? '#34d399'
                      : '#f87171',
              }}
            >
              {agent.status === 'running' && (
                <span
                  style={{
                    display: 'inline-block',
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    backgroundColor: 'currentColor',
                    animation: 'kb-pulse 2s ease-in-out infinite',
                  }}
                />
              )}
              {agent.status === 'completed' && '✓'}
              {agent.name}
            </span>
          ))}
        </div>
      )}

      {/* Tool activity feed */}
      {progress?.recentTools && progress.recentTools.length > 0 && (
        <div
          ref={feedRef}
          style={{
            maxHeight: '160px',
            overflowY: 'auto',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
            padding: '6px 14px',
          }}
          className="kb-scrollbar"
        >
          {progress.recentTools.map((entry, i) => (
            <div
              key={`${entry.tool}-${i}`}
              className="flex items-center"
              style={{ gap: '6px', padding: '2px 0' }}
            >
              {entry.running ? (
                <span
                  style={{
                    display: 'inline-block',
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    backgroundColor: '#3b82f6',
                    animation: 'kb-pulse 1.5s ease-in-out infinite',
                    flexShrink: 0,
                  }}
                />
              ) : (
                <span
                  style={{
                    display: 'inline-block',
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    backgroundColor: '#34d399',
                    flexShrink: 0,
                  }}
                />
              )}
              <span style={{ fontSize: '10px', flexShrink: 0 }}>
                {toolIcon(entry.tool)}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 500,
                  color: '#5c5e6a',
                  flexShrink: 0,
                }}
              >
                {entry.tool}
              </span>
              {entry.args && (
                <span
                  style={{
                    fontSize: '10px',
                    color: 'rgba(139, 141, 151, 0.6)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                >
                  {entry.args}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Fallback when no progress data yet */}
      {(!progress || (progress.recentTools.length === 0 && progress.agents.length === 0)) && (
        <p style={{ fontSize: '11px', color: '#5c5e6a', lineHeight: 1.4, padding: '0 14px 12px' }}>
          Analysing codebase and generating implementation plan with subtasks.
        </p>
      )}
    </div>
  );
}
