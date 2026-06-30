/**
 * Compact one-line meta strip for the loop detail (specs/09-ui-redesign.md):
 * workspace isolation · schedule/triggers · run count · operational limits ·
 * lifetime usage / budget — a single muted line of icon+text chips.
 */

import { Clock, Coins, FolderGit2, GitBranch, Gauge, Repeat } from 'lucide-react';
import type { Loop, LoopRunSummary } from '../../shared/types';
import { formatTime } from '../lib/format';
import { formatLoopUsage, summarizeLoopUsage } from '../lib/usage-summary';

/** Operational caps (attempts/concurrency/wall-clock). Token & cost budgets show
 * in the usage chip, where they pair with lifetime spend. */
function limitsSummary(loop: Loop): string | null {
  const l = loop.limits;
  const parts: string[] = [];
  if (l.maxAttemptsTotal) parts.push(`${l.maxAttemptsTotal} attempts`);
  if (l.maxConcurrentSteps) parts.push(`${l.maxConcurrentSteps} concurrent`);
  if (l.maxWallClockMs) parts.push(`${Math.round(l.maxWallClockMs / 60000)} min`);
  return parts.length ? parts.join(' · ') : null;
}

export function LoopMetaStrip({ loop, runs = [] }: { loop: Loop; runs?: LoopRunSummary[] }) {
  const { workspace } = loop;
  const resolved = loop.runtime.workspace.resolved;
  const scheduled = loop.triggers.find((t) => (t.type === 'cron' || t.type === 'hybrid') && !t.disabled);
  const limits = limitsSummary(loop);
  const usage = summarizeLoopUsage(runs, loop.limits);
  const usageText = usage ? formatLoopUsage(usage) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        {workspace.useManagedWorktree ? <GitBranch className="h-3.5 w-3.5" /> : <FolderGit2 className="h-3.5 w-3.5" />}
        {workspace.useManagedWorktree ? 'Managed worktree' : 'Workspace root'}
        {!workspace.useManagedWorktree && workspace.allowDirtyWorkspaceRoot ? ' · runs in place' : ''}
        {resolved ? ` · ${resolved.type}` : ''}
      </span>
      {scheduled ? (
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {scheduled.schedule ?? scheduled.type}
          <span className="opacity-70">· next {formatTime(scheduled.nextFireAt)}</span>
        </span>
      ) : (
        <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Manual only</span>
      )}
      {(() => {
        const t = loop.triggers.find((tr) => tr.fireCount > 0);
        const fires = loop.triggers.reduce((n, tr) => n + tr.fireCount, 0);
        return fires > 0 ? (
          <span className="flex items-center gap-1.5">
            <Repeat className="h-3.5 w-3.5" /> {fires} run(s){t?.maxFires ? ` of ${t.maxFires}` : ''}
          </span>
        ) : null;
      })()}
      {limits && (
        <span className="flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" /> {limits}</span>
      )}
      {usageText && (
        <span className="flex items-center gap-1.5"><Coins className="h-3.5 w-3.5" /> {usageText}</span>
      )}
    </div>
  );
}
