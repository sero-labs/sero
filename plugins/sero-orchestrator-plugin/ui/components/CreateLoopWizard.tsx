/**
 * Guided create flow (specs/09-ui-redesign.md, D1→D2→D3). One surface that walks:
 *   D1 Describe  — write the task; the AI plans it.
 *   D2 Clarify   — if the planner parked clarifying questions, answer them inline
 *                  (reuses the existing pendingInput/answer_input mechanism).
 *   D3 Review    — read the generated plan, refine in plain English, then save as
 *                  a draft or activate.
 * The stage is derived from the watched loop's own state — no polling.
 */

import { useState } from 'react';
import { Button, Card } from '@sero-ai/ui';
import { Loader2, Sparkles } from 'lucide-react';
import type { Loop, OrchestratorAction } from '../../shared/types';
import { useWatchedJson } from '../lib/use-watched-json';
import { deriveCreateStage, type CreateStage as Stage } from '../lib/create-stage';
import { CreateLoopForm, type CreateLoopSubmit } from './CreateLoopForm';
import { InputRequestCard } from './InputRequestCard';
import { PlanView } from './PlanView';
import { RefinePlan } from './RefinePlan';

interface CreateLoopWizardProps {
  busy: boolean;
  stateDir: string;
  /** Dispatches the create action; resolves to the new loop id (or null on error). */
  onCreate: (values: CreateLoopSubmit) => Promise<string | null>;
  onAction: (action: OrchestratorAction) => void;
  /** Leave the wizard and open the loop's detail. */
  onOpenLoop: (loopId: string) => void;
  onCancel: () => void;
}

const STEPS: { key: Stage; label: string }[] = [
  { key: 'describe', label: 'Describe' },
  { key: 'clarify', label: 'Clarify' },
  { key: 'review', label: 'Review' },
];

export function CreateLoopWizard({ busy, stateDir, onCreate, onAction, onOpenLoop, onCancel }: CreateLoopWizardProps) {
  const [loopId, setLoopId] = useState<string | null>(null);
  const loop = useWatchedJson<Loop | null>(loopId && stateDir ? `${stateDir}/loops/${loopId}/loop.json` : null, null);

  const stage = deriveCreateStage(loopId, loop);

  const create = async (values: CreateLoopSubmit) => {
    const id = await onCreate(values);
    if (id) setLoopId(id);
  };

  return (
    <div className="flex h-full flex-1 flex-col gap-4 overflow-auto p-4">
      <header className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">New loop</h1>
        <Stepper stage={stage} />
      </header>

      {stage === 'describe' && <CreateLoopForm busy={busy} onSubmit={create} onCancel={onCancel} />}

      {stage === 'planning' && (
        <Card className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> The AI is writing the plan…
        </Card>
      )}

      {stage === 'clarify' && loop && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Answer these so the AI can build the plan.</p>
          <InputRequestCard loop={loop} busy={busy} onAction={onAction} />
        </div>
      )}

      {stage === 'review' && loop && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-sky-400" />
            <h2 className="text-sm font-semibold">Here's the plan the AI wrote</h2>
          </div>
          {loop.runtime.block && (
            <Card className="border-destructive/50 p-3 text-sm">
              <span className="font-medium text-destructive">Plan generation hit a problem: </span>
              {loop.runtime.block.reason} — refine below, or cancel and try a clearer prompt.
            </Card>
          )}
          <PlanView loop={loop} onAction={onAction} />
          <RefinePlan busy={busy} onRefine={(prompt) => onAction({ kind: 'revise', loopId: loop.id, prompt })} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => onOpenLoop(loop.id)}>Save as draft</Button>
            <Button disabled={busy || loop.plan.steps.length === 0} onClick={() => { onAction({ kind: 'activate', loopId: loop.id }); onOpenLoop(loop.id); }}>
              Activate loop →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({ stage }: { stage: Stage }) {
  const activeIndex = stage === 'planning' ? 0 : STEPS.findIndex((s) => s.key === stage);
  return (
    <div className="ml-auto flex items-center gap-1.5 text-xs">
      {STEPS.map((s, i) => (
        <span key={s.key} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-muted-foreground/40">→</span>}
          <span className={i === activeIndex ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{i + 1} {s.label}</span>
        </span>
      ))}
    </div>
  );
}
