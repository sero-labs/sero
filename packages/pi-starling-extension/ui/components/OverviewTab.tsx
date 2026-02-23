/**
 * Overview tab — balance cards, spending chart, daily trend, recent transactions.
 */

import type { StarlingBalance, StarlingFeedItem } from '../../shared/types';
import { formatMoney } from '../lib/helpers';
import { TransactionRow } from './TransactionRow';
import { SpendingChart } from './SpendingChart';
import { DailyTrendChart } from './DailyTrendChart';

export function OverviewTab({
  balance,
  transactions,
  currency,
}: {
  balance: StarlingBalance | null;
  transactions: StarlingFeedItem[] | null;
  currency: string;
}) {
  return (
    <div className="sb-animate-in flex flex-col gap-4">
      {/* Balance cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="sb-card p-4">
          <div className="sb-stat-label mb-2">Available Balance</div>
          <div className="sb-mono sb-glow-green text-2xl font-semibold" style={{ color: 'var(--sb-accent)' }}>
            {balance ? formatMoney(balance.effectiveBalance.minorUnits, currency) : '---'}
          </div>
        </div>
        <div className="sb-card p-4">
          <div className="sb-stat-label mb-2">Current Balance</div>
          <div className="sb-mono text-2xl font-semibold" style={{ color: 'var(--sb-text)' }}>
            {balance ? formatMoney(balance.amount.minorUnits, currency) : '---'}
          </div>
        </div>
      </div>

      {/* Additional balance */}
      {balance && (
        <div className="grid grid-cols-2 gap-4">
          <div className="sb-card p-4">
            <div className="sb-stat-label mb-1">Cleared Balance</div>
            <div className="sb-mono text-lg" style={{ color: 'var(--sb-muted)' }}>
              {formatMoney(balance.clearedBalance.minorUnits, currency)}
            </div>
          </div>
          <div className="sb-card p-4">
            <div className="sb-stat-label mb-1">Pending</div>
            <div className="sb-mono text-lg" style={{ color: 'var(--sb-secondary)' }}>
              {formatMoney(balance.pendingTransactions.minorUnits, currency)}
            </div>
          </div>
        </div>
      )}

      {/* Spending chart */}
      {transactions && transactions.length > 0 && (
        <div className="sb-card p-4">
          <div className="sb-stat-label mb-3">Spending by Category (30 days)</div>
          <SpendingChart transactions={transactions} />
        </div>
      )}

      {/* Daily trend */}
      {transactions && transactions.length > 2 && (
        <div className="sb-card p-4">
          <div className="sb-stat-label mb-3">Daily Spending Trend</div>
          <DailyTrendChart transactions={transactions} />
        </div>
      )}

      {/* Recent transactions */}
      {transactions && transactions.length > 0 && (
        <div className="sb-card p-4">
          <div className="sb-stat-label mb-3">Recent Transactions</div>
          {transactions.slice(0, 5).map((tx) => (
            <TransactionRow key={tx.feedItemUid} tx={tx} />
          ))}
        </div>
      )}

      {!transactions && !balance && (
        <div className="sb-animate-in flex flex-col items-center justify-center py-12">
          <p className="text-sm" style={{ color: 'var(--sb-muted)' }}>
            No data available. Click Refresh to load your account.
          </p>
        </div>
      )}
    </div>
  );
}
