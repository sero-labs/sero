/**
 * Live-activity header (specs/09-ui-redesign.md, B3 touch). Shown only while the
 * loop has an active run. It follows the Architect's project header: what is
 * running on the left, and the run's figures in a side panel on the right.
 *
 * Everything is derived from already-persisted state — the watched loop.json
 * (running step) and runs/index.json (accumulated tokens/cost + run start) — so
 * it updates push-style as each step completes. No timer and no polling:
 * elapsed reflects the moment of the last step update.
 */

import type { Loop, RunIndex } from '../../shared/types';
import { formatCost, formatDuration } from '../lib/format';

interface LiveActivityStripProps {
  loop: Loop;
  runIndex: RunIndex;
}

export function LiveActivityStrip({ loop, runIndex }: LiveActivityStripProps) {
  const activeRunId = loop.runtime.activeRunId;
  if (!activeRunId) return null;

  const steps = loop.plan.steps;
  const statusOf = (id: string) => loop.runtime.stepStates[id]?.status;
  const runningSteps = steps.filter((s) => statusOf(s.id) === 'running');
  const done = steps.filter((s) => statusOf(s.id) === 'succeeded' || statusOf(s.id) === 'skipped').length;
  const activeRun = runIndex.runs.find((r) => r.id === activeRunId);
  const startedAt = activeRun?.startedAt ?? loop.runtime.lastRunAt;
  // Recomputed each render; the component re-renders when the watched run index /
  // loop updates (i.e. as each step completes), so elapsed advances per step.
  const elapsedMs = startedAt ? Date.now() - new Date(startedAt).getTime() : undefined;
  const usage = activeRun?.usage;
  const figures = [
    usage?.costUsd !== undefined && ['Cost', formatCost(usage.costUsd)],
    usage?.totalTokens !== undefined && ['Tokens', usage.totalTokens.toLocaleString()],
    elapsedMs !== undefined && ['Elapsed', formatDuration(elapsedMs)],
  ].filter((entry): entry is [string, string] => Array.isArray(entry));

  return (
    <section
      aria-label="Live activity"
      className="flex flex-col overflow-hidden rounded-[10px] border border-emerald-500/30 bg-card @min-[720px]/panel:flex-row"
    >
      <div className="min-w-0 flex-1 px-[18px] py-4">
        <p className="flex items-center gap-2 text-xs font-medium text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Running
        </p>
        <h3 className="mt-2 line-clamp-2 text-[17px] font-semibold leading-tight tracking-tight text-foreground">
          {runningSteps.length > 0 ? runningSteps.map((s) => s.title).join(' · ') : 'Preparing the next step…'}
        </h3>
        {steps.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {done} of {steps.length} steps done
          </p>
        )}
      </div>
      {figures.length > 0 && (
        <dl className="flex shrink-0 flex-col justify-center gap-1.5 border-t border-border bg-(--bg-elevated) px-5 py-4 @min-[720px]/panel:w-60 @min-[720px]/panel:border-t-0 @min-[720px]/panel:border-l">
          {figures.map(([label, value], index) => (
            <div key={label} className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className={`font-mono tabular-nums ${index === 0 ? 'text-lg text-emerald-400' : 'text-sm text-foreground'}`}>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
