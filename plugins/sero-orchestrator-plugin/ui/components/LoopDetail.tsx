import { Badge, Card, Separator } from '@sero-ai/ui';
import { AlertTriangle, GitBranch, FolderGit2 } from 'lucide-react';
import type { Loop, LoopLimits, OrchestratorAction } from '../../shared/types';
import { LOOP_STATUS_LABEL, loopStatusVariant, formatTime } from '../lib/format';

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
import { PlanView } from './PlanView';
import { AttemptHistory } from './AttemptHistory';

interface LoopDetailProps {
  loop: Loop;
  busy: boolean;
  onAction: (action: OrchestratorAction) => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function LoopDetail({ loop, busy, onAction }: LoopDetailProps) {
  const { runtime, workspace } = loop;
  const resolved = runtime.workspace.resolved;

  return (
    <div className="flex h-full flex-1 flex-col gap-4 overflow-auto p-4">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">{loop.title}</h1>
          <Badge variant={loopStatusVariant(loop.status)}>{LOOP_STATUS_LABEL[loop.status]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{loop.summary || loop.prompt}</p>
        <LoopControls loop={loop} busy={busy} onAction={onAction} />
      </header>

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
            {resolved ? ` · ${resolved.type} (${resolved.cwd})` : ' · not resolved yet'}
          </span>
        </Card>
      </Section>

      <Section title="Triggers & limits">
        <Card className="flex flex-col gap-1 p-3 text-xs">
          <div>
            <span className="font-medium">Triggers: </span>
            {loop.triggers.length === 0
              ? 'Manual only'
              : loop.triggers
                  .map((t) => `${t.type}${t.schedule ? ` (${t.schedule})` : ''}${t.disabled ? ' — disabled' : ''}`)
                  .join(', ')}
          </div>
          <div className="text-muted-foreground">
            {formatLimits(loop.limits)}
          </div>
        </Card>
      </Section>

      <Section title="Generated plan">
        <PlanView loop={loop} />
      </Section>

      <Section title="Attempt history">
        <AttemptHistory loop={loop} />
      </Section>

      <footer className="text-xs text-muted-foreground">
        Created {formatTime(loop.createdAt)} · Updated {formatTime(loop.updatedAt)} · {loop.runs.length} run(s)
      </footer>
    </div>
  );
}
