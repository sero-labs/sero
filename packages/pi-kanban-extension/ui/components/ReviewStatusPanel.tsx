/**
 * ReviewStatusPanel — shown when a card has a PR created and is
 * awaiting user merge/completion.
 */

import type { Card } from '../../shared/types';

export function ReviewStatusPanel({
  card,
  onComplete,
}: {
  card: Card;
  onComplete: () => void;
}) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div
        style={{
          padding: '14px',
          borderRadius: '8px',
          border: '1px solid rgba(52, 211, 153, 0.2)',
          backgroundColor: 'rgba(52, 211, 153, 0.04)',
          marginBottom: '12px',
        }}
      >
        <div className="flex items-center" style={{ gap: '10px', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#34d399' }}>
            PR #{card.prNumber} created
          </span>
        </div>
        <p style={{ fontSize: '11px', color: '#8b8d97', lineHeight: 1.4, marginBottom: '8px' }}>
          Review and merge the PR, then mark this card as done.
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
        onClick={onComplete}
        style={{
          width: '100%',
          padding: '10px 16px',
          borderRadius: '8px',
          border: 'none',
          backgroundColor: '#34d399',
          color: '#0f1117',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        Mark Done
      </button>
    </div>
  );
}
