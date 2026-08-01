import { Button, Spinner, Textarea } from '@sero-ai/ui';
import { Pencil, RotateCcw, Sparkles } from 'lucide-react';
import { useState } from 'react';

import type { AnimationRecord, LoopMode } from '../../shared/character';
import { AnimationReportRows } from './AnimationReportRows';
import { CHECKER_STYLE, SpritePixels } from './SpritePixels';
import { Crumbs, DetailPanel, Field } from './PanelParts';

/**
 * The second and last gate (D5).
 *
 * The sequence is presented finished, with the repairs already done and
 * declared. Every way out is offered at once: approve it, ask the AI to fix it,
 * open a frame and paint it, or run the whole thing again from an amended
 * instruction.
 */

const LOOP_LABEL: Record<LoopMode, string> = {
  once: 'does not loop',
  forward: 'loops',
  pingpong: 'ping-pong',
};

interface AnimationCheckpointProps {
  animation: AnimationRecord;
  characterName: string;
  paletteSize: number;
  /** The animation this approval moves on to, when there is one. */
  nextName: string | undefined;
  /**
   * What the runtime is doing right now, when it is doing something.
   *
   * A repair asked for here does not change the animation's status, so without
   * this the button is pressed, a paid redraw runs for a minute, and the screen
   * says nothing — so it is pressed again.
   */
  working: string | undefined;
  onApprove(): void;
  onFix(instruction: string): void;
  onEditFrames(): void;
  onRedo(instruction: string): void;
  onOpenShelf(): void;
  onOpenCharacter(): void;
}

export function AnimationCheckpoint({
  animation,
  characterName,
  paletteSize,
  nextName,
  working,
  onApprove,
  onFix,
  onEditFrames,
  onRedo,
  onOpenShelf,
  onOpenCharacter,
}: AnimationCheckpointProps) {
  const [instruction, setInstruction] = useState('');
  const { canvas, frames, plan } = animation;
  // Nothing that spends money is pressable while something is already running.
  const busy = working !== undefined;

  return (
    // `min-w-0` so this surface shrinks beside the character rail instead of
    // pushing it off the side of the window.
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5">
        <Crumbs
          trail={[
            { label: 'Sprite Studio', onClick: onOpenShelf },
            { label: characterName, onClick: onOpenCharacter },
          ]}
          last={plan.name}
        />

        <div className="border-border bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
          <div className="border-border text-muted-foreground flex h-9 items-center gap-2 border-b px-3 text-sm">
            {frames.length} frames
            <span className="ml-auto font-mono text-xs">
              {canvas.cols} × {canvas.rows} canvas · feet on row {animation.anchor.row}
            </span>
          </div>
          <div
            className="flex min-h-0 flex-1 items-center gap-1 overflow-x-auto p-3"
            style={CHECKER_STYLE}
          >
            {frames.map((frame, index) => (
              <SpritePixels
                key={frame.id}
                path={frame.file}
                version={animation.updatedAt}
                cols={canvas.cols}
                rows={canvas.rows}
                scale={1}
                alt={`Frame ${index + 1}`}
                className="shrink-0"
              />
            ))}
          </div>
        </div>

        <AnimationReportRows animation={animation} paletteSize={paletteSize} />
      </div>

      <DetailPanel
        eyebrow="Checkpoint 2 of 2"
        title={plan.name}
        subtitle={`${frames.length} frames · ${plan.playRate} fps · ${LOOP_LABEL[plan.loop]}`}
        footer={
          <>
            {working !== undefined && (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <Spinner className="size-4" />
                {working}
              </p>
            )}
            <Button type="button" onClick={onApprove} disabled={busy}>
              {nextName === undefined ? 'Approve' : `Approve · continue to ${nextName}`}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() => {
                  onFix(instruction.trim());
                  setInstruction('');
                }}
              >
                <Sparkles className="size-3.5" />
                Fix with AI
              </Button>
              <Button type="button" variant="outline" className="flex-1" onClick={onEditFrames}>
                <Pencil className="size-3.5" />
                Edit frames
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              className="text-amber-400"
              disabled={busy}
              onClick={() => {
                onRedo(instruction.trim());
                setInstruction('');
              }}
            >
              <RotateCcw className="size-3.5" />
              Redo the whole sequence
            </Button>
          </>
        }
      >
        <Field label="What it was asked to do">
          <p className="text-sm leading-relaxed">{plan.instruction}</p>
        </Field>

        {animation.history.length > 0 && (
          <Field label="What was already changed">
            <ul className="space-y-1 text-sm leading-relaxed">
              {animation.history.map((revision) => (
                <li key={revision.id} className="text-muted-foreground">
                  {revision.reason}
                </li>
              ))}
            </ul>
          </Field>
        )}

        <Field label="What to fix">
          <Textarea
            rows={3}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="Optional. His hat brim changes shape halfway through."
          />
          <p className="text-muted-foreground text-sm leading-relaxed">
            Fixing keeps the frames that were right. Redo runs the whole sequence again.
          </p>
        </Field>
      </DetailPanel>
    </div>
  );
}
