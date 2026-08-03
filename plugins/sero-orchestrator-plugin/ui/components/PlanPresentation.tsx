import { useState } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@sero-ai/ui';
import { Columns3, ListTree, Map, Rows3 } from 'lucide-react';
import type { Loop, OrchestratorAction } from '../../shared/types';
import { PlanMap, type PlanMapOrientationSetting } from './PlanMap';
import { PlanView } from './PlanView';

type PlanPresentationMode = 'map' | 'details';

interface PlanPresentationProps {
  loop: Loop;
  onAction: (action: OrchestratorAction) => void;
}

export function PlanPresentation({ loop, onAction }: PlanPresentationProps) {
  const [mode, setMode] = useState<PlanPresentationMode>(loop.status === 'draft' ? 'map' : 'details');
  const [orientation, setOrientation] = useState<PlanMapOrientationSetting>('auto');

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
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={orientation}
            onValueChange={(value) => value && setOrientation(value as PlanMapOrientationSetting)}
            aria-label="Map direction"
          >
            <ToggleGroupItem value="auto">Auto</ToggleGroupItem>
            <ToggleGroupItem value="horizontal"><Columns3 /> Horizontal</ToggleGroupItem>
            <ToggleGroupItem value="vertical"><Rows3 /> Vertical</ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>

      {mode === 'map'
        ? <PlanMap loop={loop} orientation={orientation} />
        : <PlanView loop={loop} onAction={onAction} />}
    </div>
  );
}
