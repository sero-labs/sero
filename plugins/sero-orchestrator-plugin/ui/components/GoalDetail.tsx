import { type ReactNode, useState } from 'react';
import { Button } from '@sero-ai/ui';

import type { DecisionKind, LoopCheck, LoopGoal, LoopStatus, SuccessCriterion } from '../../shared/types';
import type { OrchestratorActions } from '../lib/actions';
import { AttemptTimeline } from './AttemptTimeline';
import { EditGoalForm } from './EditGoalForm';
import { LoopControls } from './LoopControls';
import { StatusBadge } from './StatusBadge';
import '../styles.css';

const MODE_LABEL = {
  'background-worker': 'Background worker',
  'active-session': 'Active chat',
  hybrid: 'Hybrid',
} as const;

// A finished goal is immutable; everything else can be edited / re-planned.
const TERMINAL: ReadonlySet<LoopStatus> = new Set<LoopStatus>(['complete', 'stopped']);

// How each criterion is checked, in plain words (spec 05).
const DECISION_LABEL: Record<DecisionKind, string> = {
  'exit-zero': 'command',
  threshold: 'measure',
  judge: 'judge',
};

function checkLabel(check: LoopCheck): string {
  if (check.type === 'review') return `Review — ${check.reviewer}`;
  return `${check.type === 'verification' ? 'Verify' : 'Command'} — ${check.command}`;
}

/** One row per LLM-authored success criterion. */
function CriteriaList({ criteria }: { criteria: SuccessCriterion[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {criteria.map((criterion) => (
        <li
          key={criterion.id}
          className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm"
        >
          <span className="min-w-0 flex-1 truncate text-foreground">{criterion.description}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {DECISION_LABEL[criterion.decision.kind]}
          </span>
          {criterion.required && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">required</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

interface GoalDetailProps {
  loop: LoopGoal;
  actions: OrchestratorActions;
}

export function GoalDetail({ loop, actions }: GoalDetailProps) {
  const [editing, setEditing] = useState(false);
  const editable = !TERMINAL.has(loop.status);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{loop.title}</h1>
          <StatusBadge status={loop.status} />
        </div>
        <LoopControls loop={loop} actions={actions} />
        {loop.statusReason && (
          <p className="text-sm text-muted-foreground">{loop.statusReason}</p>
        )}
      </header>

      <Section title="Goal">
        {editing ? (
          <EditGoalForm loop={loop} actions={actions} onDone={() => setEditing(false)} />
        ) : (
          <>
            <p className="whitespace-pre-wrap text-sm text-foreground">{loop.goal}</p>
            <p className="text-xs text-muted-foreground">
              Runs as {MODE_LABEL[loop.executionMode]} · stops after {loop.stopRule.maxAttempts} attempts
            </p>
            {editable && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={actions.busy} onClick={() => setEditing(true)}>
                  Edit goal
                </Button>
                <Button size="sm" variant="outline" disabled={actions.busy} onClick={() => actions.replan(loop.id)}>
                  Re-derive plan
                </Button>
              </div>
            )}
          </>
        )}
      </Section>

      <Section title="Verification">
        {loop.status === 'draft' ? (
          <p className="text-sm text-muted-foreground">Working out how to check this goal…</p>
        ) : loop.verificationPlan ? (
          <CriteriaList criteria={loop.verificationPlan.criteria} />
        ) : loop.checks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No checks yet — Sero will detect them when the loop first runs.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {loop.checks.map((check, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-foreground">{checkLabel(check)}</span>
                {check.required && (
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    required
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Attempts">
        <AttemptTimeline attempts={loop.attempts} />
      </Section>
    </div>
  );
}

export default GoalDetail;
