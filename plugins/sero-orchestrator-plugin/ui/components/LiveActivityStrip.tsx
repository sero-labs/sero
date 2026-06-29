/**
 * Live-activity strip (specs/09-ui-redesign.md, B3 touch). Shown only while the
 * loop has an active run. Everything is derived from already-persisted state —
 * the watched loop.json (running step) and runs/index.json (accumulated
 * tokens/cost + run start) — so it updates push-style as each step completes. No
 * timer and no polling: elapsed reflects the moment of the last step update.
 */

import { Card } from '@sero-ai/ui';
import type { Loop, RunIndex } from '../../shared/types';
import { formatCost, formatDuration } from '../lib/format';

interface LiveActivityStripProps {
  loop: Loop;
  runIndex: RunIndex;
}

export function LiveActivityStrip({ loop, runIndex }: LiveActivityStripProps) {
  const activeRunId = loop.runtime.activeRunId;
  if (!activeRunId) return null;

  const runningSteps = loop.plan.steps.filter((s) => loop.runtime.stepStates[s.id]?.status === 'running');
  const activeRun = runIndex.runs.find((r) => r.id === activeRunId);
  const startedAt = activeRun?.startedAt ?? loop.runtime.lastRunAt;
  // Recomputed each render; the component re-renders when the watched run index /
  // loop updates (i.e. as each step completes), so elapsed advances per step.
  const elapsedMs = startedAt ? Date.now() - new Date(startedAt).getTime() : undefined;
  const usage = activeRun?.usage;

  return (
    <Card className="flex flex-wrap items-center gap-x-4 gap-y-1 border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
      <span className="flex items-center gap-2 font-medium text-emerald-400">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        Running
      </span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {runningSteps.length > 0
          ? runningSteps.map((s) => s.title).join(' · ')
          : 'Preparing the next step…'}
      </span>
      {elapsedMs !== undefined && <Stat label="elapsed" value={formatDuration(elapsedMs)} />}
      {usage?.totalTokens !== undefined && <Stat label="tokens" value={usage.totalTokens.toLocaleString()} />}
      {usage?.costUsd !== undefined && <Stat label="cost" value={formatCost(usage.costUsd)} />}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1 text-xs tabular-nums text-muted-foreground">
      <span className="font-medium text-foreground">{value}</span>
      {label}
    </span>
  );
}
