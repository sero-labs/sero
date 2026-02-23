/**
 * Savings tab — goal cards with progress bars.
 */

import type { StarlingSavingsGoal } from '../../shared/types';
import { formatMoney } from '../lib/helpers';

export function SavingsTab({ savingsGoals }: { savingsGoals: StarlingSavingsGoal[] | null }) {
  if (!savingsGoals?.length) {
    return (
      <div className="sb-animate-in flex flex-col items-center justify-center py-16">
        <div className="sb-icon-circle mb-6" style={{ width: 60, height: 60 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" style={{ color: 'var(--sb-accent)' }}>
            <path d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16" />
            <path d="M3 21h18" /><path d="M9 7h6" /><path d="M9 11h6" /><path d="M9 15h4" />
          </svg>
        </div>
        <p className="text-sm" style={{ color: 'var(--sb-muted)' }}>
          No savings goals found. Create one in your Starling app.
        </p>
      </div>
    );
  }

  return (
    <div className="sb-animate-in flex flex-col gap-4">
      {savingsGoals.map((goal) => {
        const saved = goal.totalSaved.minorUnits;
        const target = goal.target?.minorUnits || 0;
        const percent = target > 0 ? Math.min(100, (saved / target) * 100) : 0;
        const currency = goal.totalSaved.currency;

        return (
          <div key={goal.savingsGoalUid} className="sb-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium" style={{ color: 'var(--sb-text)' }}>{goal.name}</span>
              <span className="sb-mono text-xs" style={{ color: 'var(--sb-accent)' }}>
                {goal.state === 'ACTIVE' ? 'Active' : goal.state}
              </span>
            </div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="sb-mono sb-glow-green text-xl font-semibold" style={{ color: 'var(--sb-accent)' }}>
                {formatMoney(saved, currency)}
              </span>
              {target > 0 && (
                <span className="sb-mono text-sm" style={{ color: 'var(--sb-muted)' }}>
                  of {formatMoney(target, currency)}
                </span>
              )}
            </div>
            {target > 0 && (
              <>
                <div className="sb-progress-track">
                  <div className="sb-progress-fill" style={{ width: `${percent}%` }} />
                </div>
                <div className="mt-1.5 text-right">
                  <span className="sb-mono text-xs" style={{ color: 'var(--sb-dim)' }}>
                    {percent.toFixed(1)}%
                  </span>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
