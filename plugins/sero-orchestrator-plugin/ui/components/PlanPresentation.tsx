import { useId, useState } from 'react';
import { Slider } from '@sero-ai/ui/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@sero-ai/ui/components/ui/toggle-group';
import { ListTree, Map } from 'lucide-react';
import type { Loop, OrchestratorAction } from '../../shared/types';
import {
  clampStepsPerRow,
  PLAN_MAP_STEPS_PER_ROW_MAX,
  PLAN_MAP_STEPS_PER_ROW_MIN,
} from '../lib/plan-map-layout';
import { useOrchestratorState } from '../lib/orchestrator-state';
import { PlanMap } from './PlanMap';
import { PlanView } from './PlanView';

type PlanPresentationMode = 'map' | 'details';

interface PlanPresentationProps {
  loop: Loop;
  onAction: (action: OrchestratorAction) => void;
}

export function PlanPresentation({ loop, onAction }: PlanPresentationProps) {
  const [mode, setMode] = useState<PlanPresentationMode>(loop.status === 'draft' ? 'map' : 'details');
  const { state, updateState } = useOrchestratorState();
  const sliderId = useId();
  const stepsPerRow = clampStepsPerRow(state.ui?.planStepsPerRow);

  const setStepsPerRow = (next: number) =>
    updateState((current) => ({
      ...current,
      ui: { ...current.ui, planStepsPerRow: clampStepsPerRow(next) },
    }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={mode}
          onValueChange={(value) => value && setMode(value as PlanPresentationMode)}
          aria-label="Plan presentation"
        >
          <ToggleGroupItem value="map"><Map /> Map</ToggleGroupItem>
          <ToggleGroupItem value="details"><ListTree /> Details</ToggleGroupItem>
        </ToggleGroup>

        {mode === 'map' && (
          <div className="flex items-center gap-2.5">
            <label htmlFor={sliderId} className="text-xs text-muted-foreground">Steps per row</label>
            <Slider
              id={sliderId}
              className="w-28"
              min={PLAN_MAP_STEPS_PER_ROW_MIN}
              max={PLAN_MAP_STEPS_PER_ROW_MAX}
              step={1}
              value={[stepsPerRow]}
              onValueChange={([next]) => setStepsPerRow(next)}
            />
            <span className="w-3 text-xs tabular-nums">{stepsPerRow}</span>
          </div>
        )}
      </div>

      {mode === 'map'
        ? <PlanMap loop={loop} stepsPerRow={stepsPerRow} />
        : <PlanView loop={loop} onAction={onAction} />}
    </div>
  );
}
