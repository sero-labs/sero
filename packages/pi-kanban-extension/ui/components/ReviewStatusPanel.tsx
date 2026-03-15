/**
 * ReviewStatusPanel — shown when a card has a PR created and is
 * awaiting user merge/completion.
 */

import type { Card } from '../../shared/types';
import { getReviewPrStatus } from '../lib/review-pr-status';

export function ReviewStatusPanel({
  card,
  onCheckMerge,
}: {
  card: Card;
  onCheckMerge: () => void;
}) {
  const status = getReviewPrStatus(card);

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
      </div>
      <button
        onClick={onCheckMerge}
        style={{
          width: '100%',
          padding: '10px 16px',
          borderRadius: '8px',
          border: 'none',
          backgroundColor: status.tone.buttonBackground,
          color: status.tone.buttonText,
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        {status.actionLabel}
      </button>
    </div>
  );
}
