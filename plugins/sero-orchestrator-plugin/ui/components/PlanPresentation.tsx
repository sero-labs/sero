import { useId, useState } from 'react';
import { useAppPreferences } from '@sero-ai/app-runtime';
import { ChevronRight } from 'lucide-react';
import { Slider } from '@sero-ai/ui/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@sero-ai/ui/components/ui/toggle-group';
import type { Loop, OrchestratorAction } from '../../shared/types';
import {
  clampStepsPerRow,
  PLAN_MAP_STEPS_PER_ROW_MAX,
  PLAN_MAP_STEPS_PER_ROW_MIN,
} from '../lib/plan-map-layout';
import { PlanMap } from './PlanMap';
import { PlanView } from './PlanView';

type PlanPresentationMode = 'map' | 'details';

interface PlanPresentationProps {
  loop: Loop;
  onAction: (action: OrchestratorAction) => void;
}

function resolveMode(value: unknown, loop: Loop): PlanPresentationMode {
  if (value === 'map' || value === 'details') return value;
  return loop.status === 'draft' ? 'map' : 'details';
}

/**
 * The objective, with the request that started the Workflow behind its chevron
 * (prototype frame 1).
 *
 * Every Workflow has this row, including one that recorded no objective: the
 * request is what the Workflow was asked to do. It used to be shown only when
 * there was no objective to say it better, so a Workflow with both said the
 * objective twice and one with neither said nothing at all.
 */
function ObjectiveRow({ loop }: { loop: Loop }) {
  const [open, setOpen] = useState(false);
  const requestId = useId();
  const objective = loop.plan.objective;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2 text-sm leading-relaxed text-room-text2">
        <p className="min-w-0">
          {objective
            ? <><span className="font-semibold text-room-text">Objective</span> · {objective}</>
            : <span className="text-room-text3">No objective was recorded for this Workflow.</span>}
        </p>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={requestId}
          aria-label="Show the request"
          onClick={() => setOpen((was) => !was)}
          className="mt-0.5 shrink-0 cursor-pointer rounded p-0.5 text-room-text3 transition-colors hover:text-room-text"
        >
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
      </div>
      {open && (
        <dl
          id={requestId}
          className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 rounded-lg border border-room-line bg-room-surface px-3 py-2.5"
        >
          <dt className="text-xs uppercase tracking-wide text-room-text3">Request</dt>
          <dd className="text-[12.5px] leading-[1.55] text-room-text2">{loop.prompt}</dd>
        </dl>
      )}
    </div>
  );
}

export function PlanPresentation({ loop, onAction }: PlanPresentationProps) {
  const { values: profilePreferences, set: setProfilePreference } = useAppPreferences();
  const sliderLabelId = useId();
  const stepsPerRow = clampStepsPerRow(profilePreferences.planStepsPerRow);
  const mode = resolveMode(profilePreferences.planPresentationMode, loop);

  const setMode = (next: PlanPresentationMode) =>
    setProfilePreference('planPresentationMode', next);

  const setStepsPerRow = (next: number) =>
    setProfilePreference('planStepsPerRow', clampStepsPerRow(next));

  return (
    <div className="flex flex-col gap-3">
      {/* Above the switch: the objective is the plan's, not one view's. */}
      <ObjectiveRow loop={loop} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={mode}
          onValueChange={(value) => value && setMode(value as PlanPresentationMode)}
          aria-label="Plan presentation"
        >
          <ToggleGroupItem value="map">Map</ToggleGroupItem>
          <ToggleGroupItem value="details">Details</ToggleGroupItem>
        </ToggleGroup>

        {mode === 'map' && (
          <div className="flex items-center gap-2.5">
            <span id={sliderLabelId} className="text-xs text-muted-foreground">Steps per row</span>
            <Slider
              aria-labelledby={sliderLabelId}
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
