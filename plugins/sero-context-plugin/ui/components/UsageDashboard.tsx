/**
 * UsageDashboard — visual breakdown of context window token usage.
 *
 * Shows a segmented progress bar, percentage, token counts, and
 * the "steps since last tag" health indicator.
 */

import { useMemo } from 'react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { cn } from '@sero-ai/ui/lib/utils';
import type { ContextUsage } from '../../shared/types';

interface Props {
  usage: ContextUsage | null;
  stepsSinceTag: number;
  nearestTag: string;
  totalEntries: number;
}

// ── Category definitions ──────────────────────────────────────

interface Category {
  label: string;
  value: number;
  color: string; // Tailwind bg class
  textColor: string; // Tailwind text class
}

function buildCategories(usage: ContextUsage): Category[] {
  const { breakdown, contextWindow, tokens } = usage;
  const cats: Category[] = [
    { label: 'System', value: breakdown.system, color: 'bg-zinc-500', textColor: 'text-zinc-400' },
    { label: 'Tool Defs', value: breakdown.toolDefs, color: 'bg-zinc-600', textColor: 'text-zinc-500' },
    { label: 'Messages', value: breakdown.messages, color: 'bg-indigo-500', textColor: 'text-indigo-400' },
    { label: 'Tool Calls', value: breakdown.toolCalls + breakdown.toolResults, color: 'bg-emerald-500', textColor: 'text-emerald-400' },
  ];
  if (breakdown.other > 10) {
    cats.push({ label: 'Other', value: breakdown.other, color: 'bg-zinc-700', textColor: 'text-zinc-500' });
  }
  const available = Math.max(0, contextWindow - tokens);
  cats.push({ label: 'Available', value: available, color: 'bg-secondary', textColor: 'text-muted-foreground' });
  return cats;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return Math.round(n / 1_000) + 'k';
  return n.toString();
}

function pct(value: number, total: number): string {
  return total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
}

// ── Component ─────────────────────────────────────────────────

export function UsageDashboard({ usage, stepsSinceTag, nearestTag, totalEntries }: Props) {
  const categories = useMemo(() => (usage ? buildCategories(usage) : []), [usage]);

  // Health heuristic: >10 steps without a tag is drifting
  const tagHealth: 'good' | 'warn' | 'danger' =
    stepsSinceTag <= 5 ? 'good' : stepsSinceTag <= 15 ? 'warn' : 'danger';

  const usageHealth: 'good' | 'warn' | 'danger' = !usage
    ? 'good'
    : usage.percent < 50
      ? 'good'
      : usage.percent < 80
        ? 'warn'
        : 'danger';

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Context Usage
      </h2>

      {!usage ? (
        <p className="text-xs text-muted-foreground">
          No usage data available. Refresh to update.
        </p>
      ) : (
        <>
          {/* Main usage bar */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-light tabular-nums text-foreground">
                {usage.percent.toFixed(1)}%
              </span>
              <span className="text-xs text-muted-foreground">
                {formatTokens(usage.tokens)} / {formatTokens(usage.contextWindow)}
              </span>
            </div>

            {/* Segmented bar */}
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary">
              {categories
                .filter((c) => c.label !== 'Available')
                .map((cat) => {
                  const width = (cat.value / usage.contextWindow) * 100;
                  if (width < 0.3) return null;
                  return (
                    <div
                      key={cat.label}
                      className={cn('h-full transition-all duration-300', cat.color)}
                      style={{ width: `${width}%` }}
                      title={`${cat.label}: ${formatTokens(cat.value)} (${pct(cat.value, usage.contextWindow)}%)`}
                    />
                  );
                })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {categories
              .filter((c) => c.value > 0)
              .map((cat) => (
                <div key={cat.label} className="flex items-center gap-1.5">
                  <div className={cn('h-2 w-2 rounded-full', cat.color)} />
                  <span className="text-[11px] text-muted-foreground">
                    {cat.label}
                  </span>
                  <span className={cn('text-[11px] tabular-nums', cat.textColor)}>
                    {formatTokens(cat.value)}
                  </span>
                </div>
              ))}
          </div>
        </>
      )}

      {/* Health indicators */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <HealthBadge
          label={`${stepsSinceTag} steps since tag`}
          sublabel={nearestTag !== 'None' ? nearestTag : undefined}
          health={tagHealth}
        />
        {usage && (
          <HealthBadge
            label={`${usage.percent.toFixed(0)}% context used`}
            health={usageHealth}
          />
        )}
        <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
          {totalEntries} total entries
        </Badge>
      </div>
    </div>
  );
}

// ── Health Badge ──────────────────────────────────────────────

function HealthBadge({
  label,
  sublabel,
  health,
}: {
  label: string;
  sublabel?: string;
  health: 'good' | 'warn' | 'danger';
}) {
  const dotColor =
    health === 'good'
      ? 'bg-emerald-500'
      : health === 'warn'
        ? 'bg-amber-500'
        : 'bg-red-500';

  return (
    <Badge variant="outline" className="gap-1.5 text-[11px] font-normal text-muted-foreground">
      <span className={cn('inline-block h-1.5 w-1.5 rounded-full', dotColor)} />
      {label}
      {sublabel && (
        <span className="font-mono text-[10px] text-muted-foreground/60">
          {sublabel}
        </span>
      )}
    </Badge>
  );
}
