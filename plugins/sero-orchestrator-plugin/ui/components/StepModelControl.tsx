import { useState } from 'react';
import { isModelTier, MODEL_TIERS } from '@sero-ai/common';
import type { AppModelGroup } from '@sero-ai/app-runtime';
import { AvailableModelPicker } from '@sero-ai/ui/model-selection/available-model-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sero-ai/ui/components/ui/select';
import type { LoopStepDefinition } from '../../shared/types';

const AUTO = '__auto__';
const CUSTOM = '__custom__';

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
 */
export function StepModelControl({ step, groups, onChange }: StepModelControlProps) {
  const model = currentModel(step);
  const isPinned = !!model && !isModelTier(model);
  const [customArmed, setCustomArmed] = useState(false);
  const showCustom = customArmed || isPinned;

  const onSelect = (value: string) => {
    if (value === CUSTOM) {
      setCustomArmed(true);
      return;
    }
    setCustomArmed(false);
    onChange(value === AUTO ? undefined : value, undefined);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Model</span>
      <Select value={showCustom ? CUSTOM : model ?? AUTO} onValueChange={onSelect}>
        <SelectTrigger size="sm" aria-label={`Model for ${step.title}`} className="text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={AUTO}>Auto (default)</SelectItem>
          {MODEL_TIERS.map((tier) => (
            <SelectItem key={tier} value={tier}>{tier}</SelectItem>
          ))}
          <SelectItem value={CUSTOM}>Specific model…</SelectItem>
        </SelectContent>
      </Select>
      {showCustom && (
        <AvailableModelPicker
          groups={groups}
          value={isPinned ? model : ''}
          onChange={(value) => {
            setCustomArmed(value === '' ? false : customArmed);
            onChange(value || undefined, undefined);
          }}
          placeholder="Choose a model"
          allowClear
          className="min-w-[12rem]"
        />
      )}
    </div>
  );
}
