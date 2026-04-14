/**
 * CardDetailFooter — move, priority, and delete actions for a card.
 *
 * Extracted from CardDetail.tsx for file size compliance.
 */

import type { Card, Column, Priority } from '../../shared/types';
import { COLUMN_LABELS } from '../../shared/types';

const PRIORITY_COLORS: Record<Priority, { bg: string; text: string }> = {
  critical: { bg: 'rgba(248, 113, 113, 0.15)', text: '#f87171' },
  high: { bg: 'rgba(251, 191, 36, 0.15)', text: '#fbbf24' },
  medium: { bg: 'rgba(129, 140, 248, 0.15)', text: '#818cf8' },
  low: { bg: 'rgba(134, 239, 172, 0.15)', text: '#86efac' },
};

export function CardDetailFooter({
  card,
  moveTargets,
  onMove,
  onDelete,
}: {
  card: Card;
  moveTargets: Column[];
  onMove: (column: Column) => void;
  onDelete: () => void;
}) {
  const priorityColor = PRIORITY_COLORS[card.priority];

  return (
    <div
      className="shrink-0"
      style={{
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '14px 20px',
      }}
    >
      {/* Compact info row: priority label + move buttons */}
      <div className="flex items-center" style={{ gap: '12px', minHeight: '30px' }}>
        {/* Priority badge */}
        <div className="flex items-center" style={{ gap: '6px' }}>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#5c5e6a',
            }}
          >
            Priority
          </span>
          <span
            className="rounded-md font-medium"
            style={{
              fontSize: '10px',
              padding: '3px 8px',
              textTransform: 'capitalize',
              backgroundColor: priorityColor.bg,
              color: priorityColor.text,
            }}
          >
            {card.priority}
          </span>
        </div>

        {/* Separator dot */}
        {moveTargets.length > 0 && (
          <span style={{ color: '#3a3d47', fontSize: '8px' }}>●</span>
        )}

        {/* Move to buttons */}
        {moveTargets.length > 0 && (
          <div className="flex items-center" style={{ gap: '6px' }}>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#5c5e6a',
              }}
            >
              Move to
            </span>
            <div className="flex flex-wrap" style={{ gap: '4px' }}>
              {moveTargets.map((col) => (
                <button
                  key={col}
                  onClick={() => onMove(col)}
                  className="rounded-md text-xs transition-all"
                  style={{
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    backgroundColor: '#22252f',
                    padding: '4px 10px',
                    color: '#8b8d97',
                    fontSize: '11px',
                  }}
                >
                  {COLUMN_LABELS[col]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Delete button */}
        <button
          onClick={onDelete}
          className="rounded-md transition-all"
          style={{
            fontSize: '11px',
            fontWeight: 500,
            padding: '5px 12px',
            color: 'rgba(248, 113, 113, 0.85)',
            border: '1px solid rgba(248, 113, 113, 0.2)',
            backgroundColor: 'rgba(248, 113, 113, 0.06)',
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
