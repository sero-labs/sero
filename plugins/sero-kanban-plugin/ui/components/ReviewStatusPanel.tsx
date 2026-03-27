/**
 * ReviewStatusPanel — shown when a card has a PR created and is
 * awaiting user merge/completion.
 *
 * Also provides "Request Revisions" (text input + send) to push
 * the card back to implementation, and "Cancel PR" to discard the
 * PR and move the card to backlog. Both actions append to the
 * error log.
 */

import type { Card } from '../../shared/types';
import { getReviewPrStatus } from '../lib/review-pr-status';
import { RevisionRequestForm } from './RevisionRequestForm';
import { CancelPRConfirmation } from './CancelPRConfirmation';

export function ReviewStatusPanel({
  card,
  onCheckMerge,
  onRequestRevisions,
  onCancelPR,
  isBusy,
  actionError,
}: {
  card: Card;
  onCheckMerge: () => void;
  onRequestRevisions: (feedback: string) => Promise<void> | void;
  onCancelPR: () => Promise<void> | void;
  isBusy?: boolean;
  actionError?: string | null;
}) {
  const status = getReviewPrStatus(card);

  const handleOpenPreview = () => {
    if (!card.previewUrl) return;
    window.open(card.previewUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div style={{ marginBottom: '20px' }}>
      <div
        style={{
          padding: '14px',
          borderRadius: '8px',
          border: `1px solid ${status.tone.border}`,
          backgroundColor: status.tone.background,
          marginBottom: '12px',
        }}
      >
        <div className="flex items-center" style={{ gap: '10px', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: status.tone.accent }}>
            {status.title}
          </span>
        </div>
        <p style={{ fontSize: '11px', color: status.tone.text, lineHeight: 1.4, marginBottom: '8px' }}>
          {status.description}
        </p>
        {card.prUrl && (
          <a
            href={card.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: '11px',
              color: '#818cf8',
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
            }}
          >
            {card.prUrl}
          </a>
        )}
        {card.previewUrl && (
          <div style={{ marginTop: '10px' }}>
            <p style={{ fontSize: '11px', color: status.tone.text, lineHeight: 1.4, marginBottom: '6px' }}>
              Preview the latest branch changes before merging:
            </p>
            <button
              onClick={handleOpenPreview}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: `1px solid ${status.tone.border}`,
                backgroundColor: 'rgba(129, 140, 248, 0.12)',
                color: '#818cf8',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                marginBottom: '6px',
              }}
            >
              Open Preview
            </button>
            <div>
              <a
                href={card.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '11px',
                  color: '#818cf8',
                  textDecoration: 'underline',
                  textUnderlineOffset: '2px',
                }}
              >
                {card.previewUrl}
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Approve / check merge */}
      <button
        onClick={onCheckMerge}
        disabled={isBusy || status.primaryActionDisabled}
        style={{
          width: '100%',
          padding: '10px 16px',
          borderRadius: '8px',
          border: 'none',
          backgroundColor: status.tone.buttonBackground,
          color: status.tone.buttonText,
          fontSize: '13px',
          fontWeight: 600,
          cursor: isBusy || status.primaryActionDisabled ? 'default' : 'pointer',
          transition: 'all 0.15s',
          marginBottom: '12px',
          opacity: isBusy || status.primaryActionDisabled ? 0.6 : 1,
        }}
      >
        {status.actionLabel}
      </button>

      <RevisionRequestForm onSubmit={onRequestRevisions} isBusy={isBusy} />
      <CancelPRConfirmation onConfirm={onCancelPR} isBusy={isBusy} />

      {actionError && (
        <p style={{ fontSize: '11px', color: '#f87171', marginTop: '10px', lineHeight: 1.4 }}>
          {actionError}
        </p>
      )}
    </div>
  );
}
