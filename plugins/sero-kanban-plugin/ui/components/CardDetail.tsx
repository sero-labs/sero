/**
 * CardDetail — slide-over panel showing full card information.
 *
 * Uses absolute positioning within the kb-root container so it
 * doesn't escape the app bounds. Elevated surface background to
 * clearly differentiate from the board.
 */

import { useCallback, useRef } from 'react';
import { useAppTools } from '@sero-ai/app-runtime';
import { AnimatePresence, motion } from 'motion/react';
import type { Card, Column, KanbanState } from '../../shared/types';
import { COLUMN_LABELS } from '../../shared/types';
import { CardStatusDot } from './StatusDot';
import { PriorityBadge } from './PriorityBadge';
import { type DescriptionEditorHandle } from './DescriptionEditor';
import { CardDetailFooter } from './CardDetailFooter';
import { CardDetailSections } from './CardDetailSections';
import { applyManualMove } from '../lib/card-workflow';
import { getManualMoveTargets } from '../../shared/validation';

type WorkflowToolAction = 'start' | 'approve' | 'complete' | 'retry' | 'request-revisions' | 'cancel-pr';

const WORKFLOW_ACTION_SUCCESS_PREFIXES: Record<WorkflowToolAction, string[]> = {
  start: ['Started #'],
  approve: ['Approved #'],
  complete: ['Completed #'],
  retry: ['Retrying #'],
  'request-revisions': ['Revision requested for #'],
  'cancel-pr': ['Cancelled PR for #'],
};

function isWorkflowActionSuccess(action: WorkflowToolAction, text: string): boolean {
  return WORKFLOW_ACTION_SUCCESS_PREFIXES[action].some((prefix) => text.startsWith(prefix));
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

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
  const workflowActionPendingRef = useRef<WorkflowToolAction | null>(null);
  const { run } = useAppTools();

  const handleMove = useCallback(
    (column: Column) => {
      if (!card) return;
      onUpdate((prev) => applyManualMove(prev, card.id, column));
    },
    [card, onUpdate],
  );

  const persistWorkflowError = useCallback((message: string) => {
    if (!card || !message.trim()) return;
    onUpdate((prev) => ({
      ...prev,
      cards: prev.cards.map((candidate) => (
        candidate.id === card.id
          ? { ...candidate, error: message, updatedAt: new Date().toISOString() }
          : candidate
      )),
    }));
  }, [card, onUpdate]);

  const invokeWorkflowAction = useCallback(async (
    action: WorkflowToolAction,
    params?: Record<string, unknown>,
    options?: { commitDraft?: boolean },
  ) => {
    if (!card || workflowActionPendingRef.current) return;

    if (options?.commitDraft) {
      descriptionEditorRef.current?.commitDraft();
    }

    workflowActionPendingRef.current = action;
    try {
      const result = await run('kanban', {
        action,
        id: card.id,
        ...(params ?? {}),
      });

      if (!isWorkflowActionSuccess(action, result.text)) {
        persistWorkflowError(result.text || `Kanban action "${action}" did not complete.`);
      }
    } catch (error) {
      persistWorkflowError(toErrorMessage(error));
    } finally {
      if (workflowActionPendingRef.current === action) {
        workflowActionPendingRef.current = null;
      }
    }
  }, [card, persistWorkflowError, run]);

  const handleStartPlanning = useCallback(() => {
    void invokeWorkflowAction('start', undefined, { commitDraft: true });
  }, [invokeWorkflowAction]);

  const handleApprovePlan = useCallback(() => {
    void invokeWorkflowAction('approve');
  }, [invokeWorkflowAction]);

  const handleCheckMergeStatus = useCallback(() => {
    void invokeWorkflowAction('complete');
  }, [invokeWorkflowAction]);

  const handleRequestRevisions = useCallback((feedback: string) => {
    void invokeWorkflowAction('request-revisions', { revisionFeedback: feedback });
  }, [invokeWorkflowAction]);

  const handleCancelPR = useCallback(() => {
    void invokeWorkflowAction('cancel-pr');
  }, [invokeWorkflowAction]);

  const handleRetry = useCallback(() => {
    void invokeWorkflowAction('retry');
  }, [invokeWorkflowAction]);

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
