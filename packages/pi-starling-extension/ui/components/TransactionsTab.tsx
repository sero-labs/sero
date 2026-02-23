/**
 * Transactions tab — searchable, grouped by date.
 */

import { useState, useMemo } from 'react';
import type { StarlingFeedItem } from '../../shared/types';
import { TransactionRow } from './TransactionRow';

export function TransactionsTab({ transactions }: { transactions: StarlingFeedItem[] | null }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!transactions) return [];
    if (!search.trim()) return transactions;
    const q = search.toLowerCase();
    return transactions.filter(
      (tx) =>
        tx.counterPartyName?.toLowerCase().includes(q) ||
        tx.reference?.toLowerCase().includes(q) ||
        tx.spendingCategory?.toLowerCase().includes(q),
    );
  }, [transactions, search]);

  const grouped = useMemo(() => {
    const groups = new Map<string, StarlingFeedItem[]>();
    for (const tx of filtered) {
      const date = new Date(tx.transactionTime).toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long',
      });
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date)!.push(tx);
    }
    return groups;
  }, [filtered]);

  if (!transactions?.length) {
    return (
      <div className="sb-animate-in flex flex-col items-center justify-center py-16">
        <p className="text-sm" style={{ color: 'var(--sb-muted)' }}>No transactions to display.</p>
      </div>
    );
  }

  return (
    <div className="sb-animate-in">
      <div className="mb-4">
        <input
          type="text" value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search transactions…"
          className="sb-input"
          style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}
        />
      </div>

      {Array.from(grouped.entries()).map(([date, txs]) => (
        <div key={date} className="mb-4">
          <div className="sb-stat-label mb-2 px-2">{date}</div>
          <div className="sb-card">
            {txs.map((tx) => (
              <div key={tx.feedItemUid} className="sb-ledger-line">
                <TransactionRow tx={tx} />
              </div>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && search && (
        <div className="py-8 text-center">
          <p className="text-sm" style={{ color: 'var(--sb-muted)' }}>No transactions match "{search}"</p>
        </div>
      )}
    </div>
  );
}
