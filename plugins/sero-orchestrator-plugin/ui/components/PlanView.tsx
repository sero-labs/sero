import { useAvailableModels, useSubagentContext } from '@sero-ai/app-runtime';
import type { Loop, LoopStepDefinition, OrchestratorAction } from '../../shared/types';
import { Card } from '@sero-ai/ui';
import { isStuckOnAttempts, RECOVERABLE_STEP_STATUSES } from '../../shared/recovery';
import { groupStepsByLevel } from '../lib/plan-levels';
import { StepCard } from './StepCard';

const routeText = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value));

interface PlanViewProps {
  loop: Loop;
  onAction: (action: OrchestratorAction) => void;
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

  const setStepModel = (stepId: string, model?: string, thinking?: string) =>
    onAction({ kind: 'set_step_model', loopId: loop.id, stepId, model, thinking });
  const setStepTools = (stepId: string, tools?: string[]) =>
    onAction({ kind: 'set_step_tools', loopId: loop.id, stepId, tools });

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
      <Card className="p-3 text-sm text-muted-foreground">
        No plan generated yet. Creating a loop asks the model to author the steps for your prompt.
      </Card>
    );
  }

  const levels = groupStepsByLevel(plan.steps);
  const numberOf = new Map(plan.steps.map((s, i) => [s.id, i + 1]));
  // showNumber is off for a lone step (the spine rail shows its number) and on
  // inside a parallel/branch group, whose rail marker is a glyph not a number.
  const renderCard = (step: LoopStepDefinition, showNumber: boolean) => (
    <StepCard
      key={step.id}
      step={step}
      number={numberOf.get(step.id)!}
      showNumber={showNumber}
      state={runtime.stepStates[step.id]}
      groups={groups}
      toolCatalog={toolCatalog}
      onSetModel={setStepModel}
      onSetTools={setStepTools}
      onRetry={onRetryFor(step)}
    />
  );

  return (
    <div className="flex flex-col gap-2">
      {plan.objective && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Objective: </span>{plan.objective}
        </p>
      )}
      <div className="flex flex-col">
        {levels.map((group, i) => {
          const isLast = i === levels.length - 1;
          if (group.length === 1) {
            return (
              <SpineRow key={group[0].id} marker={String(numberOf.get(group[0].id))} isLast={isLast}>
                {renderCard(group[0], false)}
              </SpineRow>
            );
          }
          const branchVar = group.find((s) => s.when)?.when?.var;
          const chosen = branchVar ? runtime.variables[branchVar] : undefined;
          const header = branchVar
            ? `Branch · ${branchVar}${chosen !== undefined ? ` = ${routeText(chosen)}` : ' (not decided yet)'}`
            : `Run in parallel · ${group.length} steps`;
          return (
            <SpineRow key={group.map((s) => s.id).join('+')} marker={branchVar ? '⌥' : '⇉'} isLast={isLast}>
              <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-2">
                <span className="text-xs font-medium text-muted-foreground">{header}</span>
                <div className="grid gap-2 sm:grid-cols-2">{group.map((step) => renderCard(step, true))}</div>
              </div>
            </SpineRow>
          );
        })}
      </div>
    </div>
  );
}

/** One row on the vertical plan spine: a rail marker + a connector line + content. */
function SpineRow({ marker, isLast, children }: { marker: string; isLast: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-card text-[11px] tabular-nums text-muted-foreground">
          {marker}
        </span>
        {!isLast && <span className="w-px flex-1 bg-border" />}
      </div>
      <div className="min-w-0 flex-1 pb-3">{children}</div>
    </div>
  );
}
