import { isModelTier, MODEL_TIERS } from '@sero-ai/common';
import type { AppModelGroup } from '@sero-ai/app-runtime';
import { AvailableModelPicker } from '@sero-ai/ui/model-selection/available-model-picker';
import type { LoopStepDefinition } from '../../shared/types';

const AUTO = 'Auto';

/** Auto and the tiers come first, then every model. One query filters both. */
const LEADING_OPTIONS = [
  { value: AUTO, label: 'Auto (default)' },
  ...MODEL_TIERS.map((tier) => ({ value: tier, label: tier })),
];

interface StepModelControlProps {
  step: LoopStepDefinition;
  groups: AppModelGroup[];
  onChange: (model?: string, thinking?: string) => void;
}

function currentModel(step: LoopStepDefinition): string | undefined {
  return 'model' in step.execution ? step.execution.model : undefined;
}

/**
 * Per-step model selector. The orchestrator's planner picks a tier
 * (LOW/MED/HIGH) for each step; this lets the user override it — keep the tier,
 * pick a different tier, pin a specific model, or revert to the default. A
 * pinned model that is unavailable at run time blocks until the model is restored
 * or the user selects an authorized available model.
 *
 * One field, as the drawing shows: Auto, the tiers and every model in the same
 * type-to-filter list. Clearing a pin picks Auto again.
 */
export function StepModelControl({ step, groups, onChange }: StepModelControlProps) {
  const model = currentModel(step);
  // Only a pinned model has a pin to clear. A tier or Auto is not a pin, and
  // the drawing shows no clear control beside one.
  const pinned = !!model && !isModelTier(model);

  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-xs text-muted-foreground">Model</span>
      <AvailableModelPicker
        groups={groups}
        value={model ?? AUTO}
        onChange={(next) => onChange(next === AUTO || next === '' ? undefined : next, undefined)}
        leadingOptions={LEADING_OPTIONS}
        ariaLabel={`Model for ${step.title}`}
        allowClear={pinned}
        className="w-80"
      />
    </div>
  );
}
