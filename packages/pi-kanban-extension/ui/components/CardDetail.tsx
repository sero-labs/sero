/**
 * CardDetail — slide-over panel showing full card information.
 *
 * Uses absolute positioning within the kb-root container so it
 * doesn't escape the app bounds. Elevated surface background to
 * clearly differentiate from the board.
 */

import { useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Card, Column, Priority, KanbanState } from '../../shared/types';
import { COLUMNS, COLUMN_LABELS } from '../../shared/types';
import { CardStatusDot, SubtaskStatusDot } from './StatusDot';
import { PriorityBadge } from './PriorityBadge';
import { PlanningActivityPanel } from './PlanningActivityPanel';
import { ImplementationActivityPanel } from './ImplementationActivityPanel';
import { ReviewActivityPanel } from './ReviewActivityPanel';
import { ReviewStatusPanel } from './ReviewStatusPanel';
import { PlanApprovalPanel } from './PlanApprovalPanel';
import { DescriptionEditor } from './DescriptionEditor';
import { CardDetailFooter } from './CardDetailFooter';
import { applyManualMove, applyWorkflowTransition, applyRequestRevisions, applyCancelPR } from '../lib/card-workflow';
import { isReviewMergeStatusMessage } from '../lib/review-pr-status';
import { getManualMoveTargets } from '../../shared/validation';

export function CardDetail({
  card,
  onClose,
  onUpdate,
  onPromptAgent,
}: {
  card: Card | null;
  onClose: () => void;
  onUpdate: (updater: (state: KanbanState) => KanbanState) => void;
  onPromptAgent?: (message: string) => void;
}) {
  const handleMove = useCallback(
    (column: Column) => {
      if (!card) return;
      onUpdate((prev) => applyManualMove(prev, card.id, column));
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
    onUpdate((prev) => applyWorkflowTransition(prev, card.id, 'planning'));
  }, [card, onUpdate]);

  const handleApprovePlan = useCallback(() => {
    if (!card) return;
    onUpdate((prev) => applyWorkflowTransition(prev, card.id, 'in-progress'));
  }, [card, onUpdate]);

  const handleCheckMergeStatus = useCallback(() => {
    if (!card) return;
    onUpdate((prev) => applyWorkflowTransition(prev, card.id, 'done'));
  }, [card, onUpdate]);

  const handleRequestRevisions = useCallback((feedback: string) => {
    if (!card) return;
    onUpdate((prev) => applyRequestRevisions(prev, card.id, feedback));
    // Log to error log via the extension
    const escaped = feedback.replace(/"/g, '\\"');
    onPromptAgent?.(
      `Using the kanban tool: report-error for card #${card.id} `
      + `with errorMessage "Revision requested: ${escaped}" `
      + `and errorSeverity "warning" and phase "review" `
      + `and agentName "user"`,
    );
  }, [card, onUpdate, onPromptAgent]);

  const handleCancelPR = useCallback(() => {
    if (!card) return;
    onUpdate((prev) => applyCancelPR(prev, card.id));
    // Log to error log via the extension
    onPromptAgent?.(
      `Using the kanban tool: report-error for card #${card.id} `
      + `with errorMessage "PR cancelled by user — card returned to backlog" `
      + `and errorSeverity "warning" and phase "review" `
      + `and agentName "user"`,
    );
  }, [card, onUpdate, onPromptAgent]);

  const handleRetry = useCallback(() => {
    if (!card) return;
    const retryable: Column[] = ['planning', 'in-progress', 'review'];
    if (!retryable.includes(card.column)) return;
    onUpdate((prev) => ({
      ...prev,
      cards: prev.cards.map((c) =>
        c.id === card.id
          ? {
              ...c,
              status: 'agent-working' as const,
              error: undefined,
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

              {/* Description — editable with AI enhance */}
              <DescriptionEditor card={card} onUpdate={onUpdate} />

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
                        PR:{' '}
                        <a
                          href={card.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium"
                          style={{ color: '#34d399', textDecoration: 'underline', textUnderlineOffset: '2px' }}
                        >
                          #{card.prNumber}
                        </a>
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
                    Moves card to Planning and triggers automated planning plus subtask generation.
                  </p>
                </div>
              )}

              {card.column === 'planning' && card.status === 'agent-working' && (
                <PlanningActivityPanel progress={card.planningProgress} />
              )}

              {card.column === 'planning' && card.status === 'waiting-input' && (
                <PlanApprovalPanel
                  onApprove={handleApprovePlan}
                  onReject={() => handleMove('backlog')}
                />
              )}

              {/* Implementation activity panel */}
              {card.column === 'in-progress' && card.status === 'agent-working' && (
                <ImplementationActivityPanel card={card} progress={card.implementationProgress} />
              )}

              {/* Review activity panel */}
              {card.column === 'review' && card.status === 'agent-working' && (
                <ReviewActivityPanel progress={card.reviewProgress} />
              )}

              {/* PR ready — awaiting user completion */}
              {card.column === 'review' && card.status === 'waiting-input' && card.prUrl && (
                <ReviewStatusPanel
                  card={card}
                  onCheckMerge={handleCheckMergeStatus}
                  onRequestRevisions={handleRequestRevisions}
                  onCancelPR={handleCancelPR}
                />
              )}

              {/* Error */}
              {card.error && !(
                card.column === 'review'
                && card.status === 'waiting-input'
                && card.prUrl
                && isReviewMergeStatusMessage(card.error)
              ) && (
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
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: '#fca5a5', whiteSpace: 'pre-wrap' }}
                  >
                    {card.error}
                  </p>
                </div>
              )}

              {/* Retry button for stuck/failed cards in active columns */}
              {(card.column === 'planning' || card.column === 'in-progress' || card.column === 'review')
                && (card.status === 'failed' || card.status === 'idle') && (
                <div style={{ marginBottom: '20px' }}>
                  <button
                    onClick={handleRetry}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      borderRadius: '8px',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      backgroundColor: 'rgba(245, 158, 11, 0.1)',
                      color: '#f59e0b',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {card.status === 'failed' ? 'Retry' : `Resume ${COLUMN_LABELS[card.column]}`}
                  </button>
                  <p style={{ fontSize: '11px', color: '#5c5e6a', marginTop: '6px', lineHeight: 1.4 }}>
                    {card.status === 'failed'
                      ? 'Re-triggers the current phase. Clears the error and restarts.'
                      : 'This card appears stuck. Retry to re-trigger the orchestrator.'}
                  </p>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <CardDetailFooter
              card={card}
              moveTargets={getManualMoveTargets(card)}
              onMove={handleMove}
              onPriorityChange={handlePriorityChange}
              onDelete={handleDelete}
            />
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
