import { useAvailableModels, useSubagentContext } from '@sero-ai/app-runtime';
import type { Loop, LoopStepDefinition, OrchestratorAction } from '../../shared/types';
import { Card } from '@sero-ai/ui/components/ui/card';
import { GitBranch, Users } from 'lucide-react';
import { isStuckOnAttempts, RECOVERABLE_STEP_STATUSES } from '../../shared/recovery';
import { fanOutView } from '../lib/fan-out-summary';
import { planStages, stageLabel, type PlanStage } from '../lib/plan-stages';
import { loopBackTitle } from '../lib/step-detail';
import { StepCard } from './StepCard';

interface PlanViewProps {
  loop: Loop;
  onAction: (action: OrchestratorAction) => void;
}

/** Where a level sits on a loop that goes back: its end, its start, or in between. */
type LoopRail = { part: 'to' | 'from' | 'through'; title: string };

const RAIL_CLASS: Record<LoopRail['part'], string> = {
  to: 'orc-loop-row orc-loop-to',
  from: 'orc-loop-row orc-loop-from',
  through: 'orc-loop-row orc-loop-through',
};

/**
 * Which levels a loop-back passes through, so the rail can draw it.
 *
 * The plan used to say this in a banner above the steps: "↩ Feedback:
 * verify-release → harden-and-cover". Two step ids told the reader nothing
 * about where on the plan the loop went, and the ids appear nowhere else on
 * the page. The rail draws it where it happens, and the step that decides
 * carries the condition in words.
 */
function loopRails(loop: Loop, stages: PlanStage[]): Map<number, LoopRail> {
  const levelOf = new Map<string, number>();
  stages.forEach((stage, index) => stage.steps.forEach(({ step }) => levelOf.set(step.id, index)));
  const numberOf = new Map(loop.plan.steps.map((step, index) => [step.id, index + 1]));

  const rails = new Map<number, LoopRail>();
  for (const step of loop.plan.steps) {
    if (!step.feedback) continue;
    const from = levelOf.get(step.id);
    const to = levelOf.get(step.feedback.toStepId);
    if (from === undefined || to === undefined || to >= from) continue;
    const title = loopBackTitle(loop, step, numberOf) ?? '';
    // A level already on another loop keeps the rail it has: two brackets in
    // the same gutter would draw over each other and read as one loop.
    for (let index = to; index <= from; index += 1) {
      if (rails.has(index)) continue;
      rails.set(index, { part: index === to ? 'to' : index === from ? 'from' : 'through', title });
    }
  }
  return rails;
}

/**
 * The generated plan as a vertical spine (specs/09-ui-redesign.md, C3 + C1):
 * steps run top→bottom; a level whose steps run together is boxed as a parallel
 * group; a level whose steps carry branch guards is boxed as a branch (one path
 * taken). The plan is LLM-authored — copy must not imply a fixed workflow.
 */
export function PlanView({ loop, onAction }: PlanViewProps) {
  const { plan, runtime } = loop;
  const { groups } = useAvailableModels();
  const { context } = useSubagentContext(loop.workspaceId);
  const toolCatalog = context?.tools ?? [];
  const agentCatalog = context?.agents ?? [];

  const setStepModel = (stepId: string, model?: string, thinking?: string) =>
    onAction({ kind: 'set_step_model', loopId: loop.id, stepId, model, thinking });
  const setStepTools = (stepId: string, tools?: string[]) =>
    onAction({ kind: 'set_step_tools', loopId: loop.id, stepId, tools });
  const setStepAgent = (stepId: string, agent?: string) =>
    onAction({ kind: 'set_step_agent', loopId: loop.id, stepId, agent });

  // Per-step Retry: a blocked/failed/needs-revision (or attempts-stuck) step when
  // no run is in flight. Resets that step and runs the loop on from there.
  const canRunRecovery = !runtime.activeRunId;
  const onRetryFor = (step: LoopStepDefinition): (() => void) | undefined => {
    const state = runtime.stepStates[step.id];
    if (!canRunRecovery || !state) return undefined;
    const recoverable = RECOVERABLE_STEP_STATUSES.has(state.status) || isStuckOnAttempts(loop, step, state);
    return recoverable ? () => onAction({ kind: 'retry_step', loopId: loop.id, stepId: step.id }) : undefined;
  };

  if (plan.steps.length === 0) {
    return (
      <Card className="p-3 text-base text-muted-foreground">
        No plan generated yet. Creating a Workflow asks the model to write the steps for your prompt.
      </Card>
    );
  }

  const stages = planStages(plan.steps);
  const numberOf = new Map(plan.steps.map((s, i) => [s.id, i + 1]));
  const rails = loopRails(loop, stages);
  // showNumber is off for a lone step (the spine rail shows its number) and on
  // inside a group, whose rail marker is the group's icon, as on the Map.
  const renderCard = (step: LoopStepDefinition, showNumber: boolean) => (
    <StepCard
      key={step.id}
      step={step}
      number={numberOf.get(step.id)!}
      loop={loop}
      numberOf={numberOf}
      showNumber={showNumber}
      state={runtime.stepStates[step.id]}
      groups={groups}
      toolCatalog={toolCatalog}
      agentCatalog={agentCatalog}
      onSetModel={setStepModel}
      onSetTools={setStepTools}
      onSetAgent={setStepAgent}
      onRetry={onRetryFor(step)}
      fanOut={step.fanOut ? fanOutView(loop.runs, step.id) : undefined}
    />
  );

  return (
    // The gutter holds the loop-back bracket, so it exists only when one does.
    <div className={`flex flex-col${rails.size > 0 ? ' pl-4' : ''}`}>
      {stages.map((stage, i) => {
        const isLast = i === stages.length - 1;
        const rail = rails.get(i);
        const key = stage.steps.map(({ step }) => step.id).join('+');
        if (stage.kind === 'single') {
          const { step, number } = stage.steps[0];
          return (
            <SpineRow key={key} marker={String(number)} isLast={isLast} rail={rail}>
              {renderCard(step, false)}
            </SpineRow>
          );
        }
        const Icon = stage.kind === 'parallel' ? Users : GitBranch;
        return (
          <SpineRow key={key} marker={<Icon className="size-3" aria-label={stage.kind === 'parallel' ? 'Run together' : 'Branch'} />} isLast={isLast} rail={rail}>
            <div className="orc-group">
              <span className="px-1 text-xs text-room-text3">
                {stageLabel(stage.kind, stage.branchVar, stage.steps.length, runtime.variables)}
              </span>
              <div className="grid grid-cols-2 items-start gap-2">
                {stage.steps.map(({ step }) => renderCard(step, true))}
              </div>
            </div>
          </SpineRow>
        );
      })}
    </div>
  );
}

/** One row on the vertical plan spine: a rail marker, the line down to the next, and the content. */
function SpineRow({ marker, isLast, rail, children }: { marker: React.ReactNode; isLast: boolean; rail?: LoopRail; children: React.ReactNode }) {
  return (
    <div className={`flex gap-3${rail ? ` ${RAIL_CLASS[rail.part]}` : ''}`} title={rail?.title}>
      <div className="flex w-6 shrink-0 flex-col items-center">
        <span className="orc-rail-mark">{marker}</span>
        {!isLast && <span className="w-px flex-1 bg-room-line-strong" />}
      </div>
      <div className="min-w-0 flex-1 pb-3">{children}</div>
    </div>
  );
}
