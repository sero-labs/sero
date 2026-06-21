import { Badge, Card } from '@sero-ai/ui';
import type { Loop, StepRuntimeState } from '../../shared/types';
import { stepStatusVariant } from '../lib/format';

interface PlanViewProps {
  loop: Loop;
}

/**
 * Renders the generated step plan: objective, each step's instructions,
 * dependencies, expected outcome, execution target, and runtime status.
 * The plan is LLM-authored — copy must not imply a fixed workflow.
 */
export function PlanView({ loop }: PlanViewProps) {
  const { plan, runtime } = loop;

  if (plan.steps.length === 0) {
    return (
      <Card className="p-3 text-sm text-muted-foreground">
        No plan generated yet. Creating a loop asks the model to author the steps for your prompt.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {plan.objective && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Objective: </span>
          {plan.objective}
        </p>
      )}
      {plan.steps.map((step, index) => {
        const state: StepRuntimeState | undefined = runtime.stepStates[step.id];
        return (
          <Card key={step.id} className="flex flex-col gap-1 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{index + 1}.</span>
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
            {state?.outcome && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Outcome: </span>
                {state.outcome.summary}
                {state.attempts > 0 ? ` · ${state.attempts} attempt(s)` : ''}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
