/**
 * Compact one-line meta strip for the loop detail (specs/09-ui-redesign.md):
 * workspace isolation · schedule/triggers · limits — replacing the old stacked
 * cards with a single muted line of icon+text chips, matching the wireframe.
 */

import { Clock, Coins, FolderGit2, GitBranch, Repeat } from 'lucide-react';
import type { Loop } from '../../shared/types';
import { formatTime } from '../lib/format';

function limitsSummary(loop: Loop): string | null {
  const l = loop.limits;
  const parts: string[] = [];
  if (l.maxAttemptsTotal) parts.push(`${l.maxAttemptsTotal} attempts`);
  if (l.maxConcurrentSteps) parts.push(`${l.maxConcurrentSteps} concurrent`);
  if (l.maxTotalTokens) parts.push(`${(l.maxTotalTokens / 1000).toFixed(0)}k tok`);
  if (l.maxCostUsd) parts.push(`$${l.maxCostUsd}`);
  if (l.maxWallClockMs) parts.push(`${Math.round(l.maxWallClockMs / 60000)} min`);
  return parts.length ? parts.join(' · ') : null;
}

export function LoopMetaStrip({ loop }: { loop: Loop }) {
  const { workspace } = loop;
  const resolved = loop.runtime.workspace.resolved;
  const scheduled = loop.triggers.find((t) => (t.type === 'cron' || t.type === 'hybrid') && !t.disabled);
  const limits = limitsSummary(loop);

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
        <span className="flex items-center gap-1.5"><Coins className="h-3.5 w-3.5" /> {limits}</span>
      )}
    </div>
  );
}
