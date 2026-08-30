import { Button } from '@sero-ai/ui/components/ui/button';
import type { Goal } from '../../shared/goal-types';
import { formatCost } from '../lib/format';
import { GoalDeleteButton } from './GoalDeleteButton';

export type GoalManageAction = 'pause' | 'resume' | 'stop' | 'delete' | 'raise-limit';

function sessionName(path: string): string {
  return (path.split(/[\\/]/).pop() ?? path).replace(/\.jsonl?$/, '');
}

function statusText(goal: Goal): string {
  if (goal.closedAt) return 'Stopped';
  if (goal.status === 'complete') return 'Reported complete';
  if (goal.status === 'paused' && goal.pauseReason === 'no-progress') return 'Held for no progress';
  return goal.status[0].toUpperCase() + goal.status.slice(1);
}

function UsageRow({ label, used, limit }: { label: string; used: string; limit?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-room-line py-2 last:border-0">
      <span className="text-xs text-room-text3">{label}</span>
      <span className="room-tabular text-xs text-room-text2">{used}{limit ? ` / ${limit}` : ''}</span>
    </div>
  );
}

export function GoalDetail({ goal, busy, onAction, onBack }: {
  goal: Goal;
  busy: boolean;
  onAction: (action: GoalManageAction) => void;
  onBack: () => void;
}) {
  const finished = Boolean(goal.closedAt) || goal.status === 'complete';
  const canResume = !finished && ['paused', 'waiting', 'blocked'].includes(goal.status);
  return (
    <div className="flex h-full flex-1 flex-col overflow-auto px-5 py-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <button type="button" className="mb-2 text-xs text-room-text3 hover:text-room-text" onClick={onBack}>Back to Goals</button>
          <h2 className="text-xl font-semibold tracking-tight text-room-text">{goal.objective}</h2>
          <p className="mt-1 text-xs text-room-text3">{statusText(goal)} · {sessionName(goal.sessionPath)} · {goal.id}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {goal.status === 'active' && !finished ? <Button size="sm" disabled={busy} onClick={() => onAction('pause')}>Pause</Button> : null}
          {canResume ? <Button size="sm" disabled={busy} onClick={() => onAction('resume')}>Resume</Button> : null}
          {goal.status === 'limited' && !finished ? <Button size="sm" disabled={busy} onClick={() => onAction('raise-limit')}>Raise turn budget and resume</Button> : null}
          {!finished ? <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction('stop')}>Stop</Button> : null}
          {finished ? <GoalDeleteButton busy={busy} onDelete={() => onAction('delete')} /> : null}
        </div>
      </div>

      <div className="grid gap-3 @min-[720px]/panel:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.65fr)]">
        <div className="space-y-3">
          <section className="rounded-[10px] border border-room-line bg-room-surface p-3.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-room-text3">Criteria and evidence</h3>
            {goal.criteria.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm text-room-text2">
                {goal.criteria.map((criterion) => <li key={criterion}>- {criterion}</li>)}
              </ul>
            ) : <p className="mt-3 text-sm text-room-text3">The objective is the criterion.</p>}
            {goal.reportedComplete?.evidence || goal.block?.evidence ? (
              <div className="mt-4 border-t border-room-line pt-3">
                <div className="text-xs font-semibold text-room-text3">Evidence</div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-room-text2">{goal.reportedComplete?.evidence ?? goal.block?.evidence}</p>
              </div>
            ) : <p className="mt-4 text-xs text-room-text4">No evidence recorded yet.</p>}
            {goal.status === 'complete' ? <p className="mt-3 text-xs text-room-text4">This is the agent's claim. Phase 1 does not verify it.</p> : null}
          </section>

          <section className="rounded-[10px] border border-room-line bg-room-surface p-3.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-room-text3">Transition history</h3>
            <ol className="mt-3 space-y-3">
              {goal.history.toReversed().map((entry) => (
                <li key={`${entry.at}:${entry.from}:${entry.to}:${entry.reason}`} className="grid grid-cols-[72px_1fr] gap-3 text-xs">
                  <time className="room-tabular text-room-text4">{new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                  <span className="text-room-text2"><b>{entry.to}</b> · {entry.reason}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="space-y-3">
          {(goal.wait?.reason || goal.block?.reason || goal.limitReached || goal.pauseReason === 'no-progress') ? (
            <section className="rounded-[10px] border border-status-warning/30 bg-status-warning-subtle p-3.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-status-warning">Why it stopped</h3>
              <p className="mt-2 text-sm text-room-text2">
                {goal.block?.reason ?? goal.wait?.reason ?? (goal.pauseReason === 'no-progress'
                  ? 'Three turns repeated the same result without a tool call.'
                  : `Reached ${goal.limitReached}. A limit is not completion.`)}
              </p>
            </section>
          ) : null}
          <section className="rounded-[10px] border border-room-line bg-room-surface p-3.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-room-text3">Usage and limits</h3>
            <div className="mt-2">
              <UsageRow label="Automatic turns" used={String(goal.usage.automaticTurns)} limit={goal.limits.maxAttemptsTotal?.toLocaleString()} />
              <UsageRow label="Tokens" used={goal.usage.totalTokens.toLocaleString()} limit={goal.limits.maxTotalTokens?.toLocaleString()} />
              <UsageRow label="Cost" used={formatCost(goal.usage.costUsd)} limit={goal.limits.maxCostUsd === undefined ? undefined : formatCost(goal.limits.maxCostUsd)} />
              <UsageRow label="Active time" used={`${Math.round(goal.usage.activeMs / 60_000)} min`} limit={goal.limits.maxWallClockMs === undefined ? undefined : `${Math.round(goal.limits.maxWallClockMs / 60_000)} min`} />
            </div>
            <p className="mt-3 text-xs text-room-text4">Only turns started by this Goal are charged.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
