/**
 * TokenTotals — aggregate token/runtime stats card.
 */

import type { CodexTotals } from '../../shared/types';
import { formatTokens, formatDurationFromSeconds } from '../lib/format';

interface TokenTotalsProps {
  totals: CodexTotals;
  completedCount: number;
}

export function TokenTotals({ totals, completedCount }: TokenTotalsProps) {
  return (
    <div className="sy-card px-4 py-3">
      <h2 className="mb-2 text-sm font-medium" style={{ color: 'var(--sy-text)' }}>
        Totals
      </h2>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        <StatItem label="Input" value={formatTokens(totals.inputTokens)} />
        <StatItem label="Output" value={formatTokens(totals.outputTokens)} />
        <StatItem label="Total" value={formatTokens(totals.totalTokens)} accent />
        <StatItem label="Runtime" value={formatDurationFromSeconds(totals.secondsRunning)} />
        <StatItem label="Completed" value={String(completedCount)} />
      </div>
    </div>
  );
}

function StatItem({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs" style={{ color: 'var(--sy-dim)' }}>{label}</div>
      <div
        className="text-lg font-light tabular-nums"
        style={{ color: accent ? 'var(--sy-accent)' : 'var(--sy-text)' }}
      >
        {value}
      </div>
    </div>
  );
}
