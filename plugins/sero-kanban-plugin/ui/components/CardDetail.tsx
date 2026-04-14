/**
 * CardDetail — slide-over panel showing full card information.
 *
 * Uses absolute positioning within the kb-root container so it
 * doesn't escape the app bounds. Elevated surface background to
 * clearly differentiate from the board.
 */

import { useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Card, Column, Priority, KanbanState } from '../../shared/types';
import { COLUMNS, COLUMN_LABELS } from '../../shared/types';
import { CardStatusDot } from './StatusDot';
import { PriorityBadge } from './PriorityBadge';
import { DescriptionEditor, type DescriptionEditorHandle } from './DescriptionEditor';
import { CardDetailFooter } from './CardDetailFooter';
import { CardDetailSections } from './CardDetailSections';
import { applyManualMove, applyWorkflowTransition, applyRequestRevisions, applyCancelPR } from '../lib/card-workflow';
import { getManualMoveTargets } from '../../shared/validation';

export function CardDetail({
  card,
  onClose,
  onUpdate,
}: {
  card: Card | null;
  onClose: () => void;
  onUpdate: (updater: (state: KanbanState) => KanbanState) => void;
}) {
  const descriptionEditorRef = useRef<DescriptionEditorHandle>(null);

  const handleMove = useCallback(
    (column: Column) => {
      if (!card) return;
      onUpdate((prev) => applyManualMove(prev, card.id, column));
    },
    [card, onUpdate],
  );

  const handleStartPlanning = useCallback(() => {
    if (!card) return;
    descriptionEditorRef.current?.commitDraft();
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
  }, [card, onUpdate]);

  const handleCancelPR = useCallback(() => {
    if (!card) return;
    onUpdate((prev) => applyCancelPR(prev, card.id));
  }, [card, onUpdate]);

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

              <CardDetailSections
                card={card}
                descriptionEditorRef={descriptionEditorRef}
                onUpdate={onUpdate}
                onStartPlanning={handleStartPlanning}
                onApprovePlan={handleApprovePlan}
                onRejectPlan={() => handleMove('backlog')}
                onCheckMergeStatus={handleCheckMergeStatus}
                onRequestRevisions={handleRequestRevisions}
                onCancelPR={handleCancelPR}
                onRetry={handleRetry}
              />
            </div>

            {/* Footer actions */}
            <CardDetailFooter
              card={card}
              moveTargets={getManualMoveTargets(card)}
              onMove={handleMove}
              onDelete={handleDelete}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
