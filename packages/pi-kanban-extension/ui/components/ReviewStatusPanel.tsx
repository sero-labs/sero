/**
 * ReviewStatusPanel — shown when a card has a PR created and is
 * awaiting user merge/completion.
 *
 * Also provides "Request Revisions" (text input + send) to push
 * the card back to implementation, and "Cancel PR" to discard the
 * PR and move the card to backlog. Both actions append to the
 * error log.
 */

import { useState } from 'react';
import type { Card } from '../../shared/types';
import { getReviewPrStatus } from '../lib/review-pr-status';

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
  const [revisionText, setRevisionText] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const handleOpenPreview = () => {
    if (!card.previewUrl) return;
    window.open(card.previewUrl, '_blank', 'noopener,noreferrer');
  };

  const handleSubmitRevisions = () => {
    const trimmed = revisionText.trim();
    if (!trimmed) return;
    onRequestRevisions(trimmed);
    setRevisionText('');
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

      {/* Request revisions */}
      <div
        style={{
          padding: '12px',
          borderRadius: '8px',
          border: '1px solid rgba(245, 158, 11, 0.2)',
          backgroundColor: 'rgba(245, 158, 11, 0.04)',
          marginBottom: '8px',
        }}
      >
        <label
          style={{ fontSize: '11px', fontWeight: 500, color: '#f59e0b', display: 'block', marginBottom: '8px' }}
        >
          Request Revisions
        </label>
        <textarea
          value={revisionText}
          onChange={(e) => setRevisionText(e.target.value)}
          disabled={isBusy}
          placeholder="Describe what needs to change..."
          rows={3}
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: '6px',
            border: '1px solid rgba(245, 158, 11, 0.15)',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            color: '#e8e4df',
            fontSize: '12px',
            lineHeight: 1.5,
            resize: 'vertical',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <button
          onClick={handleSubmitRevisions}
          disabled={isBusy || !revisionText.trim()}
          style={{
            marginTop: '8px',
            width: '100%',
            padding: '8px 14px',
            borderRadius: '8px',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            backgroundColor: revisionText.trim() ? 'rgba(245, 158, 11, 0.12)' : 'transparent',
            color: revisionText.trim() ? '#f59e0b' : '#5c5e6a',
            fontSize: '12px',
            fontWeight: 500,
            cursor: !isBusy && revisionText.trim() ? 'pointer' : 'default',
            transition: 'all 0.15s',
            opacity: isBusy ? 0.6 : 1,
          }}
        >
          Send Back for Revisions
        </button>
        <p style={{ fontSize: '10px', color: '#5c5e6a', marginTop: '4px', lineHeight: 1.4 }}>
          Moves card back to implementation with your feedback.
        </p>
      </div>

      {/* Cancel PR */}
      {!showCancelConfirm ? (
        <button
          onClick={() => setShowCancelConfirm(true)}
          disabled={isBusy}
          style={{
            width: '100%',
            padding: '8px 14px',
            borderRadius: '8px',
            border: '1px solid rgba(248, 113, 113, 0.15)',
            backgroundColor: 'transparent',
            color: '#8b8d97',
            fontSize: '12px',
            fontWeight: 500,
            cursor: isBusy ? 'default' : 'pointer',
            transition: 'all 0.15s',
            opacity: isBusy ? 0.6 : 1,
          }}
        >
          Cancel PR
        </button>
      ) : (
        <div
          style={{
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid rgba(248, 113, 113, 0.25)',
            backgroundColor: 'rgba(248, 113, 113, 0.04)',
          }}
        >
          <p style={{ fontSize: '11px', color: '#f87171', marginBottom: '8px', lineHeight: 1.4 }}>
            This will move the card back to Backlog and remove the worktree. The PR will not be deleted from GitHub.
          </p>
          <div className="flex" style={{ gap: '8px' }}>
            <button
              onClick={onCancelPR}
              disabled={isBusy}
              style={{
                flex: 1,
                padding: '8px 14px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'rgba(248, 113, 113, 0.15)',
                color: '#f87171',
                fontSize: '12px',
                fontWeight: 600,
                cursor: isBusy ? 'default' : 'pointer',
                transition: 'all 0.15s',
                opacity: isBusy ? 0.6 : 1,
              }}
            >
              Confirm Cancel
            </button>
            <button
              onClick={() => setShowCancelConfirm(false)}
              disabled={isBusy}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                backgroundColor: 'transparent',
                color: '#8b8d97',
                fontSize: '12px',
                fontWeight: 500,
                cursor: isBusy ? 'default' : 'pointer',
                transition: 'all 0.15s',
                opacity: isBusy ? 0.6 : 1,
              }}
            >
              Keep
            </button>
          </div>
        </div>
      )}

      {actionError && (
        <p style={{ fontSize: '11px', color: '#f87171', marginTop: '10px', lineHeight: 1.4 }}>
          {actionError}
        </p>
      )}
    </div>
  );
}
