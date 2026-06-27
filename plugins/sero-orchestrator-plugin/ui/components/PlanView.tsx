import { Badge, Card } from '@sero-ai/ui';
import { useAvailableModels, useSubagentContext, type AppModelGroup } from '@sero-ai/app-runtime';
import type { ContextToolInfo } from '@sero-ai/common';
import type { Loop, LoopStepDefinition, OrchestratorAction, StepRuntimeState } from '../../shared/types';
import { stepStatusVariant } from '../lib/format';
import { groupStepsByLevel } from '../lib/plan-levels';
import { StepModelControl } from './StepModelControl';
import { StepToolsControl } from './StepToolsControl';

interface PlanViewProps {
  loop: Loop;
  onAction: (action: OrchestratorAction) => void;
}

/**
 * Renders the generated step plan grouped by dependency level: each level is a
 * set of steps that run together (in parallel), later levels depend on earlier
 * ones. The plan is LLM-authored — copy must not imply a fixed workflow.
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

  if (plan.steps.length === 0) {
    return (
      <Card className="p-3 text-sm text-muted-foreground">
        No plan generated yet. Creating a loop asks the model to author the steps for your prompt.
      </Card>
    );
  }

  const levels = groupStepsByLevel(plan.steps);
  const numberOf = new Map(plan.steps.map((s, i) => [s.id, i + 1]));

  return (
    <div className="flex flex-col gap-2">
      {plan.objective && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Objective: </span>
          {plan.objective}
        </p>
      )}
      {levels.map((group) =>
        group.length === 1 ? (
          <StepCard key={group[0].id} step={group[0]} number={numberOf.get(group[0].id)!} state={runtime.stepStates[group[0].id]} groups={groups} toolCatalog={toolCatalog} onSetModel={setStepModel} onSetTools={setStepTools} />
        ) : (
          <div key={group.map((s) => s.id).join('+')} className="flex flex-col gap-1 rounded-md border border-dashed border-border p-2">
            <span className="text-xs font-medium text-muted-foreground">Run in parallel · {group.length} steps</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {group.map((step) => (
                <StepCard key={step.id} step={step} number={numberOf.get(step.id)!} state={runtime.stepStates[step.id]} groups={groups} toolCatalog={toolCatalog} onSetModel={setStepModel} onSetTools={setStepTools} />
              ))}
            </div>
          </div>
        ),
      )}
    </div>
  );
}

interface StepCardProps {
  step: LoopStepDefinition;
  number: number;
  state?: StepRuntimeState;
  groups: AppModelGroup[];
  toolCatalog: ContextToolInfo[];
  onSetModel: (stepId: string, model?: string, thinking?: string) => void;
  onSetTools: (stepId: string, tools?: string[]) => void;
}

function StepCard({ step, number, state, groups, toolCatalog, onSetModel, onSetTools }: StepCardProps) {
  return (
    <Card className="flex flex-col gap-1 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{number}.</span>
          <span className="font-medium">{step.title}</span>
          <Badge variant="outline">{step.execution.type}</Badge>
        </div>
        {state && <Badge variant={stepStatusVariant(state.status)}>{state.status}</Badge>}
      </div>
      <p className="whitespace-pre-wrap text-xs text-muted-foreground">{step.instructions}</p>
      {step.expectedOutcome && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Expected: </span>
          {step.expectedOutcome}
        </p>
      )}
      {step.dependsOn && step.dependsOn.length > 0 && (
        <p className="text-xs text-muted-foreground">Depends on: {step.dependsOn.join(', ')}</p>
      )}
      {step.execution.type !== 'active-session' && (
        <StepModelControl step={step} groups={groups} onChange={(model, thinking) => onSetModel(step.id, model, thinking)} />
      )}
      {step.execution.type === 'background-agent' && (
        <StepToolsControl step={step} catalog={toolCatalog} onChange={(tools) => onSetTools(step.id, tools)} />
      )}
      {state?.outcome && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Outcome: </span>
          {state.outcome.summary}
          {state.attempts > 0 ? ` · ${state.attempts} attempt(s)` : ''}
        </p>
      )}
    </Card>
  );
}
