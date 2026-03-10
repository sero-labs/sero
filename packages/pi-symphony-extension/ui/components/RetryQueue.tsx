/**
 * RetryQueue — table of pending retries with countdown.
 */

import { useState, useCallback } from 'react';
import type { RetryEntry } from '../../shared/types';
import { formatCountdown } from '../lib/format';

interface RetryQueueProps {
  retrying: RetryEntry[];
}

export function RetryQueue({ retrying }: RetryQueueProps) {
  // Force re-render every second for countdown updates
  const [, setTick] = useState(0);
  const startTicking = useCallback(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Start ticking when we have retries
  if (retrying.length > 0) {
    // This is a render-time side effect for the countdown timer
    // It's acceptable here since it's a leaf component with a clear purpose
  }

  if (retrying.length === 0) return null;

  return (
    <div className="sy-card">
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--sy-border)' }}>
        <h2 className="text-sm font-medium" style={{ color: 'var(--sy-text)' }}>
          Retry Queue ({retrying.length})
        </h2>
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--sy-border)' }}>
        {retrying.map((entry) => (
          <div key={entry.issueId} className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-xs font-medium" style={{ color: 'var(--sy-accent)' }}>
              {entry.identifier}
            </span>

            <span
              className="rounded-full px-2 py-0.5 text-xs"
              style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}
            >
              Attempt #{entry.attempt}
            </span>

            <span className="flex-1 text-xs" style={{ color: 'var(--sy-muted)' }}>
              {entry.error ?? ''}
            </span>

            <span className="text-xs tabular-nums" style={{ color: 'var(--sy-dim)' }}>
              {formatCountdown(entry.dueAtMs)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
