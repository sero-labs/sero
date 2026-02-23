/**
 * Single transaction row with category indicator.
 */

import type { StarlingFeedItem } from '../../shared/types';
import { formatMoney, formatDate, formatTime, getCategoryColor, friendlyCategory } from '../lib/helpers';

export function TransactionRow({ tx }: { tx: StarlingFeedItem }) {
  const isOut = tx.direction === 'OUT';
  const amount = formatMoney(tx.amount.minorUnits, tx.amount.currency);
  const name = tx.counterPartyName || tx.reference || 'Unknown';
  const catColor = getCategoryColor(tx.spendingCategory);

  return (
    <div className="sb-tx-row">
      <div className="shrink-0" style={{
        width: 8, height: 8, borderRadius: '50%',
        background: catColor, boxShadow: `0 0 6px ${catColor}40`,
      }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm" style={{ color: 'var(--sb-text)' }}>{name}</div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--sb-muted)' }}>
            {formatDate(tx.transactionTime)} {formatTime(tx.transactionTime)}
          </span>
          {tx.spendingCategory && tx.spendingCategory !== 'NONE' && (
            <span className="text-xs" style={{ color: catColor }}>
              {friendlyCategory(tx.spendingCategory)}
            </span>
          )}
        </div>
      </div>
      <div className="sb-mono shrink-0 text-sm font-medium" style={{
        color: isOut ? 'var(--sb-text)' : 'var(--sb-accent)',
        textShadow: isOut ? 'none' : '0 0 12px var(--sb-accent-glow)',
      }}>
        {isOut ? '-' : '+'}{amount}
      </div>
      {tx.status === 'PENDING' && (
        <span className="shrink-0 text-xs" style={{
          color: 'var(--sb-warning)', background: 'rgba(251,191,36,0.1)',
          padding: '2px 6px', borderRadius: 4, fontSize: 10,
        }}>Pending</span>
      )}
    </div>
  );
}
