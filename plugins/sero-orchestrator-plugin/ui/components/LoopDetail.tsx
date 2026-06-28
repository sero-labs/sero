import { Badge, Card, Separator } from '@sero-ai/ui';
import { AlertTriangle, GitBranch, FolderGit2 } from 'lucide-react';
import type { Loop, LoopLimits, OrchestratorAction, RunIndex } from '../../shared/types';
import { DEFAULT_RUN_INDEX } from '../../shared/defaults';
import { LOOP_STATUS_LABEL, loopStatusVariant, formatTime } from '../lib/format';
import { useWatchedJson } from '../lib/use-watched-json';

function formatLimits(limits: LoopLimits): string {
  const parts: string[] = [];
  if (limits.maxAttemptsPerStep) parts.push(`${limits.maxAttemptsPerStep} attempts/step`);
  if (limits.maxConcurrentSteps) parts.push(`${limits.maxConcurrentSteps} concurrent`);
  if (limits.maxAttemptsTotal) parts.push(`${limits.maxAttemptsTotal} attempts total`);
  if (limits.maxTotalTokens) parts.push(`${limits.maxTotalTokens.toLocaleString()} tokens`);
  if (limits.maxCostUsd) parts.push(`$${limits.maxCostUsd} cost`);
  if (limits.maxWallClockMs) parts.push(`${Math.round(limits.maxWallClockMs / 60000)} min wall-clock`);
  return parts.length ? `Limits: ${parts.join(' · ')}` : 'No limits set';
}
import { LoopControls } from './LoopControls';
import { LoopContextControl } from './LoopContextControl';
import { PlanView } from './PlanView';
import { RefinePlan } from './RefinePlan';
import { AttemptHistory } from './AttemptHistory';
import { SuggestionsInbox } from './SuggestionsInbox';
import { InputRequestCard } from './InputRequestCard';

const REFINABLE: ReadonlySet<Loop['status']> = new Set(['draft', 'active', 'disabled', 'blocked']);

interface LoopDetailProps {
  loop: Loop;
  busy: boolean;
  onAction: (action: OrchestratorAction) => void;
  /** State directory, used to watch this loop's runs/index.json for run history. */
  stateDir: string;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function LoopDetail({ loop, busy, onAction, stateDir }: LoopDetailProps) {
  const { runtime, workspace } = loop;
  const resolved = runtime.workspace.resolved;
  const runIndex = useWatchedJson<RunIndex>(`${stateDir}/loops/${loop.id}/runs/index.json`, DEFAULT_RUN_INDEX);

  return (
    <div className="flex h-full flex-1 flex-col gap-4 overflow-auto p-4">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">{loop.title}</h1>
          <div className="flex items-center gap-2">
            {runtime.pendingInput && (
              <Badge variant="outline" className="border-primary/40 text-primary">Waiting for you</Badge>
            )}
            <Badge variant={loopStatusVariant(loop.status)}>{LOOP_STATUS_LABEL[loop.status]}</Badge>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{loop.summary || loop.prompt}</p>
        <div className="flex flex-wrap items-center gap-2">
          <LoopControls loop={loop} busy={busy} canReflect={runIndex.runs.length > 0} onAction={onAction} />
          <LoopContextControl loop={loop} onAction={onAction} />
        </div>
      </header>

      <InputRequestCard loop={loop} busy={busy} onAction={onAction} />

      <SuggestionsInbox loop={loop} busy={busy} onAction={onAction} />

      {loop.warnings.length > 0 && (
        <Card className="flex flex-col gap-1 border-amber-500/40 p-3 text-sm">
          {loop.warnings.map((w) => (
            <div key={w.id} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
              <span>{w.message}</span>
            </div>
          ))}
        </Card>
      )}

      {runtime.block && (
        <Card className="border-destructive/50 p-3 text-sm">
          <span className="font-medium text-destructive">Blocked ({runtime.block.kind}): </span>
          {runtime.block.reason}
        </Card>
      )}

      {runtime.completion && (
        <Card className="border-emerald-500/40 p-3 text-sm">
          <span className="font-medium">Completion ({runtime.completion.status}): </span>
          {runtime.completion.reason}
        </Card>
      )}

      <Separator />

      <Section title="Workspace isolation">
        <Card className="flex items-center gap-2 p-3 text-sm">
          {workspace.useManagedWorktree ? (
            <GitBranch className="h-4 w-4 text-muted-foreground" />
          ) : (
            <FolderGit2 className="h-4 w-4 text-muted-foreground" />
          )}
          <span>
            {workspace.useManagedWorktree ? 'Managed worktree' : 'Workspace root'}
            {!workspace.useManagedWorktree && workspace.allowDirtyWorkspaceRoot ? ' · runs in place even when dirty' : ''}
            {resolved ? ` · ${resolved.type} (${resolved.cwd})` : ' · not resolved yet'}
          </span>
        </Card>
      </Section>

      <Section title="Triggers & limits">
        <Card className="flex flex-col gap-1 p-3 text-xs">
          {loop.triggers.length === 0 ? (
            <div><span className="font-medium">Triggers: </span>Manual only</div>
          ) : (
            loop.triggers.map((t) => (
              <div key={t.id}>
                <span className="font-medium">{t.type === 'cron' || t.type === 'hybrid' ? 'Schedule' : 'Trigger'}: </span>
                {t.type}
                {t.schedule ? ` · ${t.schedule}` : ''}
                {t.disabled ? ' · disabled' : ''}
                {(t.type === 'cron' || t.type === 'hybrid') && !t.disabled && (
                  <span className="text-muted-foreground">
                    {' · '}next {formatTime(t.nextFireAt)}
                    {t.lastFireAt ? ` · last ${formatTime(t.lastFireAt)}` : ''}
                    {` · ${t.fireCount} run(s)`}
                    {t.maxFires ? ` of ${t.maxFires}` : ''}
                  </span>
                )}
              </div>
            ))
          )}
          <div className="text-muted-foreground">{formatLimits(loop.limits)}</div>
        </Card>
      </Section>

      <Section title="Generated plan">
        <PlanView loop={loop} onAction={onAction} />
        {REFINABLE.has(loop.status) && (
          <RefinePlan key={loop.id} busy={busy} onRefine={(prompt) => onAction({ kind: 'revise', loopId: loop.id, prompt })} />
        )}
      </Section>

      <Section title="Attempt history">
        <AttemptHistory runs={runIndex.runs} />
      </Section>

      <footer className="text-xs text-muted-foreground">
        Created {formatTime(loop.createdAt)} · Updated {formatTime(loop.updatedAt)} · {runIndex.runs.length} run(s)
      </footer>
    </div>
  );
}
