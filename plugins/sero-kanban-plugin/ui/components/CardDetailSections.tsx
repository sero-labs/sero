import type { RefObject } from 'react';

import type { Card, KanbanState } from '../../shared/types';
import { COLUMN_LABELS } from '../../shared/types';
import { DescriptionEditor, type DescriptionEditorHandle } from './DescriptionEditor';
import { ImplementationActivityPanel } from './ImplementationActivityPanel';
import { PlanApprovalPanel } from './PlanApprovalPanel';
import { PlanningActivityPanel } from './PlanningActivityPanel';
import { ReviewActivityPanel } from './ReviewActivityPanel';
import { ReviewStatusPanel } from './ReviewStatusPanel';
import { SubtaskStatusDot } from './StatusDot';
import { isReviewMergeStatusMessage } from '../lib/review-pr-status';

interface CardDetailSectionsProps {
  card: Card;
  descriptionEditorRef: RefObject<DescriptionEditorHandle | null>;
  onUpdate: (updater: (state: KanbanState) => KanbanState) => void;
  onStartPlanning: () => void;
  onApprovePlan: () => void;
  onRejectPlan: () => void;
  onCheckMergeStatus: () => void;
  onRequestRevisions: (feedback: string) => void;
  onCancelPR: () => void;
  onRetry: () => void;
}

export function CardDetailSections({
  card,
  descriptionEditorRef,
  onUpdate,
  onStartPlanning,
  onApprovePlan,
  onRejectPlan,
  onCheckMergeStatus,
  onRequestRevisions,
  onCancelPR,
  onRetry,
}: CardDetailSectionsProps) {
  const completedSubtasks = card.subtasks.filter((subtask) => subtask.status === 'completed').length;
  const canShowRetry = (card.column === 'planning' || card.column === 'in-progress' || card.column === 'review')
    && (card.status === 'failed' || card.status === 'idle');
  const hideErrorBecauseReviewPanelOwnsIt = card.column === 'review'
    && card.status === 'waiting-input'
    && !!card.prUrl
    && !!card.error
    && isReviewMergeStatusMessage(card.error);

  return (
    <>
      <DescriptionEditor ref={descriptionEditorRef} card={card} onUpdate={onUpdate} />

      {card.acceptance.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <SectionTitle>Acceptance Criteria</SectionTitle>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {card.acceptance.map((item, index) => (
              <li key={index} className="flex items-start gap-2 text-sm" style={{ color: '#8b8d97' }}>
                <span className="mt-0.5" style={{ color: '#5c5e6a' }}>•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {card.plan && (
        <div style={{ marginBottom: '20px' }}>
          <SectionTitle>Plan</SectionTitle>
          <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: '#8b8d97' }}>
            {card.plan}
          </p>
        </div>
      )}

      {card.subtasks.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <SectionTitle>
            Subtasks ({completedSubtasks}/{card.subtasks.length})
          </SectionTitle>
          <div
            style={{
              height: '4px',
              borderRadius: '2px',
              backgroundColor: '#22252f',
              overflow: 'hidden',
              marginBottom: '12px',
            }}
          >
            <div
              style={{
                height: '100%',
                borderRadius: '2px',
                backgroundColor: '#818cf8',
                width: `${(completedSubtasks / card.subtasks.length) * 100}%`,
                transition: 'width 0.3s',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {card.subtasks.map((subtask) => (
              <div
                key={subtask.id}
                className="flex items-center rounded-md"
                style={{ gap: '10px', padding: '6px 10px' }}
              >
                <SubtaskStatusDot status={subtask.status} />
                <span
                  className="flex-1 text-xs"
                  style={{
                    color: subtask.status === 'completed' ? '#5c5e6a' : '#8b8d97',
                    textDecoration: subtask.status === 'completed' ? 'line-through' : 'none',
                  }}
                >
                  {subtask.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {card.column === 'backlog' && card.status === 'idle' && (
        <ActionPanel
          title="Start Planning"
          description="Moves card to Planning and triggers automated planning plus subtask generation."
          onClick={onStartPlanning}
          color="#818cf8"
          borderColor="rgba(129, 140, 248, 0.3)"
          backgroundColor="rgba(129, 140, 248, 0.1)"
        />
      )}

      {card.column === 'planning' && card.status === 'agent-working' && (
        <PlanningActivityPanel progress={card.planningProgress} />
      )}

      {card.column === 'planning' && card.status === 'waiting-input' && (
        <PlanApprovalPanel onApprove={onApprovePlan} onReject={onRejectPlan} />
      )}

      {card.column === 'in-progress' && card.status === 'agent-working' && (
        <ImplementationActivityPanel card={card} progress={card.implementationProgress} />
      )}

      {card.column === 'review' && card.status === 'agent-working' && (
        <ReviewActivityPanel progress={card.reviewProgress} />
      )}

      {card.column === 'review' && card.status === 'waiting-input' && card.prUrl && (
        <ReviewStatusPanel
          card={card}
          onCheckMerge={onCheckMergeStatus}
          onRequestRevisions={onRequestRevisions}
          onCancelPR={onCancelPR}
        />
      )}

      {card.error && !hideErrorBecauseReviewPanelOwnsIt && (
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
          <p className="text-xs leading-relaxed" style={{ color: '#fca5a5', whiteSpace: 'pre-wrap' }}>
            {card.error}
          </p>
        </div>
      )}

      {canShowRetry && (
        <ActionPanel
          title={card.status === 'failed' ? 'Retry' : `Resume ${COLUMN_LABELS[card.column]}`}
          description={card.status === 'failed'
            ? 'Re-triggers the current phase. Clears the error and restarts.'
            : 'This card appears stuck. Retry to re-trigger the orchestrator.'}
          onClick={onRetry}
          color="#f59e0b"
          borderColor="rgba(245, 158, 11, 0.3)"
          backgroundColor="rgba(245, 158, 11, 0.1)"
        />
      )}
    </>
  );
}

function ActionPanel({
  title,
  description,
  onClick,
  color,
  borderColor,
  backgroundColor,
}: {
  title: string;
  description: string;
  onClick: () => void;
  color: string;
  borderColor: string;
  backgroundColor: string;
}) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <button
        onClick={onClick}
        style={{
          width: '100%',
          padding: '10px 16px',
          borderRadius: '8px',
          border: `1px solid ${borderColor}`,
          backgroundColor,
          color,
          fontSize: '13px',
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        {title}
      </button>
      <p style={{ fontSize: '11px', color: '#5c5e6a', marginTop: '6px', lineHeight: 1.4 }}>
        {description}
      </p>
    </div>
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
