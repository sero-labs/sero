/**
 * Compact one-line meta strip for the loop detail (specs/09-ui-redesign.md):
 * workspace isolation · schedule/triggers · run count · operational limits ·
 * lifetime usage / budget · event-source health — a single muted line of
 * icon+text chips. Event-trigger detail (filter/condition) lives in each
 * chip's hover title.
 */

import { Activity, Clock, Coins, FolderGit2, GitBranch, Gauge, Repeat, Send, Zap } from 'lucide-react';
import type { GithubSourceHealth, Loop, LoopRunSummary, WebhookSourceHealth } from '../../shared/types';
import { formatTime } from '../lib/format';
import { deliveryChip } from '../lib/delivery-summary';
import { eventTriggerChips, sourceHealthChips } from '../lib/trigger-summary';
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

export function LoopMetaStrip({
  loop,
  runs = [],
  githubHealth = null,
  webhookHealth = null,
}: {
  loop: Loop;
  runs?: LoopRunSummary[];
  githubHealth?: GithubSourceHealth | null;
  webhookHealth?: WebhookSourceHealth | null;
}) {
  const { workspace } = loop;
  const resolved = loop.runtime.workspace.resolved;
  const scheduled = loop.triggers.find((t) => (t.type === 'cron' || t.type === 'hybrid') && !t.disabled);
  const eventChips = eventTriggerChips(loop.triggers);
  const healthChips = sourceHealthChips(loop, githubHealth, webhookHealth);
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
      {(() => {
        const chip = deliveryChip(loop);
        return (
          <span className="flex items-center gap-1.5" title={chip.title}>
            <Send className="h-3.5 w-3.5" /> {chip.label}
          </span>
        );
      })()}
      {scheduled ? (
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {scheduled.schedule ?? scheduled.type}
          <span className="opacity-70">· next {formatTime(scheduled.nextFireAt)}</span>
        </span>
      ) : eventChips.length === 0 ? (
        <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Manual only</span>
      ) : null}
      {eventChips.map((chip) => (
        <span
          key={chip.key}
          title={chip.title}
          className={`flex items-center gap-1.5 ${chip.disabled ? 'opacity-50' : ''}`}
        >
          <Zap className="h-3.5 w-3.5" /> {chip.label}
        </span>
      ))}
      {healthChips.map((chip) => (
        <span key={chip.key} className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5" /> {chip.label}
        </span>
      ))}
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
