/**
 * StatCards — summary statistics displayed as a row of compact cards.
 */

import type { WeightEntry, WeightUnit, WeightGoal } from '../shared/types';
import {
  sortedEntries,
  formatWeight,
  unitLabel,
  getWeeklyChange,
  getTotalChange,
  getGoalProgress,
} from './utils';

const NESTED_CARD_STYLE = {
  background: 'var(--wt-bg-elevated)',
  border: '1px solid var(--wt-border)',
  borderRadius: '10px',
  padding: '12px 14px',
};

interface StatCardsProps {
  entries: WeightEntry[];
  unit: WeightUnit;
  goal: WeightGoal | null;
}

export function StatCards({ entries, unit, goal }: StatCardsProps) {
  const sorted = sortedEntries(entries);
  const latest = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  const weeklyChange = getWeeklyChange(entries);
  const totalChange = getTotalChange(entries);
  const goalProgress = goal ? getGoalProgress(entries, goal) : null;

  return (
    <div className="grid grid-cols-2 gap-2.5 px-5 py-3">
      {/* Current weight */}
      <div className="col-span-2 flex items-baseline justify-between" style={NESTED_CARD_STYLE}>
        <div>
          <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--wt-muted)' }}>
            Current
          </p>
          <p className="mt-0.5 text-2xl font-light tracking-tight" style={{ color: 'var(--wt-text)' }}>
            {latest ? formatWeight(latest.weight, unit) : '—'}
            <span className="ml-1 text-sm font-normal" style={{ color: 'var(--wt-muted)' }}>
              {unitLabel(unit)}
            </span>
          </p>
        </div>
        {weeklyChange !== null && (
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--wt-muted)' }}>
              This week
            </p>
            <p
              className="mt-0.5 text-lg font-medium"
              style={{ color: weeklyChange <= 0 ? 'var(--wt-success)' : 'var(--wt-warning)' }}
            >
              {weeklyChange <= 0 ? '' : '+'}
              {formatWeight(Math.abs(weeklyChange), unit)}
            </p>
          </div>
        )}
      </div>

      {/* Total change */}
      {totalChange !== null && (
        <div style={NESTED_CARD_STYLE}>
          <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--wt-muted)' }}>
            Total change
          </p>
          <p
            className="mt-1 text-base font-medium"
            style={{ color: totalChange <= 0 ? 'var(--wt-success)' : 'var(--wt-warning)' }}
          >
            {totalChange <= 0 ? '↓ ' : '↑ '}
            {formatWeight(Math.abs(totalChange), unit)}
            <span className="ml-0.5 text-xs" style={{ color: 'var(--wt-muted)' }}>
              {unitLabel(unit)}
            </span>
          </p>
        </div>
      )}

      {/* Goal progress */}
      {goalProgress && (
        <div style={NESTED_CARD_STYLE}>
          <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--wt-muted)' }}>
            Goal progress
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--wt-grid)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.round(goalProgress.progress * 100)}%`,
                  background: goalProgress.progress >= 1
                    ? 'var(--wt-success)'
                    : 'var(--wt-accent)',
                }}
              />
            </div>
            <span className="text-xs font-medium tabular-nums" style={{ color: 'var(--wt-accent)' }}>
              {Math.round(goalProgress.progress * 100)}%
            </span>
          </div>
          {goalProgress.remaining > 0 && (
            <p className="mt-1 text-xs" style={{ color: 'var(--wt-muted)' }}>
              {formatWeight(goalProgress.remaining, unit)} {unitLabel(unit)} to go
            </p>
          )}
        </div>
      )}

      {/* Entries count (show if we don't have a goal) */}
      {!goalProgress && totalChange !== null && (
        <div style={NESTED_CARD_STYLE}>
          <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--wt-muted)' }}>
            Entries
          </p>
          <p className="mt-1 text-base font-medium tabular-nums" style={{ color: 'var(--wt-text)' }}>
            {entries.length}
          </p>
        </div>
      )}
    </div>
  );
}
