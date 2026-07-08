import { memo, useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';

import type { LoomPiece, ParamValue } from '../../shared/types';
import { ColorField, PanelCard, Slider, ToggleField, XYPad } from './primitives';

/**
 * The piece's own control surface: exactly the params the artist (agent)
 * declared for this artwork, plus the persistent creative direction.
 */
export const ControlsPanel = memo(function ControlsPanel({
  piece,
  direction,
  onParam,
  onApplyDirection,
  applyingDirection,
}: {
  piece: LoomPiece;
  direction: string;
  onParam: (name: string, value: ParamValue) => void;
  onApplyDirection: (guidance: string) => void | Promise<void>;
  applyingDirection: boolean;
}) {
  const [draftDirection, setDraftDirection] = useState<string | null>(null);
  const currentDirection = draftDirection ?? direction;

  const applyDirection = () => {
    onApplyDirection(currentDirection.trim());
    setDraftDirection(null);
  };

  return (
    <PanelCard title={piece.title || 'Untitled'}>
      {piece.idea && <p className="text-xs leading-relaxed text-muted-foreground">{piece.idea}</p>}

      {piece.params.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">This piece declares no controls — ask Loom for some.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {piece.params.map((param) => {
            const value = piece.paramValues[param.name];
            switch (param.kind) {
              case 'slider':
                return (
                  <Slider
                    key={param.name}
                    label={param.label}
                    value={typeof value === 'number' ? value : param.default}
                    min={param.min}
                    max={param.max}
                    step={param.step}
                    onChange={(v) => onParam(param.name, v)}
                  />
                );
              case 'color':
                return (
                  <ColorField
                    key={param.name}
                    label={param.label}
                    value={Array.isArray(value) && value.length === 3 ? (value as [number, number, number]) : param.default}
                    onChange={(v) => onParam(param.name, v)}
                  />
                );
              case 'toggle':
                return (
                  <ToggleField
                    key={param.name}
                    label={param.label}
                    value={typeof value === 'boolean' ? value : param.default}
                    onChange={(v) => onParam(param.name, v)}
                  />
                );
              case 'xy':
                return (
                  <XYPad
                    key={param.name}
                    label={param.label}
                    value={Array.isArray(value) && value.length === 2 ? (value as [number, number]) : param.default}
                    onChange={(v) => onParam(param.name, v)}
                  />
                );
            }
          })}
        </div>
      )}

      <div className="mt-1 flex flex-col gap-1.5 border-t border-border/60 pt-3">
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Creative direction</span>
        <textarea
          value={currentDirection}
          onChange={(e) => setDraftDirection(e.target.value)}
          placeholder="E.g. always dark, minimal, slow, no neon…"
          rows={2}
          className="resize-none rounded-md border border-input bg-background/60 px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button size="sm" variant="outline" onClick={applyDirection} disabled={applyingDirection || (!currentDirection.trim() && !direction.trim())}>
          {applyingDirection ? 'Applying…' : 'Apply to piece'}
        </Button>
      </div>
    </PanelCard>
  );
});
