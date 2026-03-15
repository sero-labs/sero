/**
 * CardDetailFooter — move, priority, and delete actions for a card.
 *
 * Extracted from CardDetail.tsx for file size compliance.
 */

import type { Card, Column, Priority } from '../../shared/types';
import { COLUMNS, COLUMN_LABELS } from '../../shared/types';

export function CardDetailFooter({
  card,
  onMove,
  onPriorityChange,
  onDelete,
}: {
  card: Card;
  onMove: (column: Column) => void;
  onPriorityChange: (priority: Priority) => void;
  onDelete: () => void;
}) {
  return (
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
              onClick={() => onMove(col)}
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

      {/* Priority (read-only) + Delete */}
      <div className="flex items-center justify-between">
        <div className="flex" style={{ gap: '4px' }}>
          {(['critical', 'high', 'medium', 'low'] as const).map((p) => (
            <span
              key={p}
              className="rounded-md font-medium"
              style={{
                fontSize: '10px',
                padding: '4px 8px',
                backgroundColor: card.priority === p ? 'rgba(129, 140, 248, 0.15)' : 'transparent',
                color: card.priority === p ? '#818cf8' : '#5c5e6a',
              }}
            >
              {p}
            </span>
          ))}
        </div>
        <button
          onClick={onDelete}
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
  );
}
