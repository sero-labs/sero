import { useState } from 'react';
import { isModelTier, MODEL_TIERS } from '@sero-ai/common';
import type { AppModelGroup } from '@sero-ai/app-runtime';
import { AvailableModelPicker } from '@sero-ai/ui/components/model-selection/available-model-picker';
import { cn } from '@sero-ai/ui/lib/utils';
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
 * pinned model that is unavailable at run time falls back to the MED tier.
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
      <select
        aria-label={`Model for ${step.title}`}
        value={showCustom ? CUSTOM : model ?? AUTO}
        onChange={(e) => onSelect(e.target.value)}
        className={selectClass}
      >
        <option value={AUTO}>Auto (default)</option>
        {MODEL_TIERS.map((tier) => (
          <option key={tier} value={tier}>{tier}</option>
        ))}
        <option value={CUSTOM}>Specific model…</option>
      </select>
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

const selectClass = cn(
  'rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring',
);
