/**
 * Horizontal bar chart — spending by category.
 */

import { useMemo } from 'react';
import type { StarlingFeedItem } from '../../shared/types';
import { formatMoney, getCategoryColor, friendlyCategory } from '../lib/helpers';

export function SpendingChart({ transactions }: { transactions: StarlingFeedItem[] }) {
  const categories = useMemo(() => {
    const totals = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.direction !== 'OUT' || tx.status === 'DECLINED' || tx.status === 'REVERSED') continue;
      const cat = tx.spendingCategory || 'NONE';
      totals.set(cat, (totals.get(cat) || 0) + tx.amount.minorUnits);
    }
    return Array.from(totals.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [transactions]);

  if (!categories.length) {
    return <p className="py-4 text-center text-xs" style={{ color: 'var(--sb-muted)' }}>No outgoing transactions found.</p>;
  }

  const maxTotal = categories[0]?.total || 1;

  return (
    <div className="flex flex-col gap-2.5">
      {categories.map(({ category, total }) => {
        const color = getCategoryColor(category);
        const pct = (total / maxTotal) * 100;
        return (
          <div key={category}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--sb-muted)' }}>{friendlyCategory(category)}</span>
              <span className="sb-mono text-xs" style={{ color }}>{formatMoney(total, 'GBP')}</span>
            </div>
            <div className="sb-progress-track" style={{ height: 6 }}>
              <div style={{
                height: '100%', borderRadius: 3, width: `${pct}%`,
                background: `linear-gradient(90deg, ${color}88, ${color})`,
                boxShadow: `0 0 8px ${color}40`, transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
