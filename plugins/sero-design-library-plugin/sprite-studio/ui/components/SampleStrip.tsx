import { Check } from 'lucide-react';

import { sampleName } from '../../shared/paths';
import { CHECKER_STYLE, SpritePixels } from './SpritePixels';

/**
 * Every moment the clip holds, as the sprite each one would become.
 *
 * Compiled sprites, not video stills. A still is not what the animation will
 * look like, and judging a take from 480p video frames would be judging
 * something we are not going to ship.
 *
 * Clicking turns a frame on or off. There is no drag, no reorder handle and no
 * timing field: order is source order and timing is measured from the clip, and
 * the workbench is where a finished sequence is edited.
 */

interface SampleStripProps {
  /** Where the previews are, relative to the app state directory. */
  previewDir: string;
  /**
   * When they were drawn.
   *
   * A redo writes new previews over the same paths, so the picture cache needs
   * something that moves or it goes on showing the previous clip's frames.
   */
  version: number;
  sampleCount: number;
  canvas: { cols: number; rows: number };
  chosen: ReadonlySet<number>;
  /** The cycle the loop search found, drawn as a band. */
  loopWindow?: { from: number; to: number };
  onToggle(index: number): void;
}

export function SampleStrip({
  previewDir,
  version,
  sampleCount,
  canvas,
  chosen,
  loopWindow,
  onToggle,
}: SampleStripProps) {
  return (
    <div className="flex min-h-0 flex-1 gap-1 overflow-x-auto p-3" style={CHECKER_STYLE}>
      {Array.from({ length: sampleCount }, (_, index) => {
        const kept = chosen.has(index);
        const inCycle =
          loopWindow !== undefined && index >= loopWindow.from && index <= loopWindow.to;
        return (
          <button
            key={index}
            type="button"
            aria-pressed={kept}
            aria-label={`Frame ${index + 1}`}
            onClick={() => onToggle(index)}
            className={`relative shrink-0 rounded-sm border-2 transition-opacity ${
              kept
                ? 'border-primary'
                : 'border-transparent opacity-40 hover:opacity-80'
            }`}
          >
            <SpritePixels
              path={`${previewDir}/${sampleName(index)}.png`}
              version={version}
              cols={canvas.cols}
              rows={canvas.rows}
              scale={1}
              alt={`Frame ${index + 1}`}
            />
            {kept && (
              <span className="bg-primary text-primary-foreground absolute top-0.5 right-0.5 rounded-sm p-0.5">
                <Check className="size-2.5" />
              </span>
            )}
            {/* The cycle the clip repeats on, marked where it is rather than
                described somewhere else on the screen. */}
            {inCycle && <span className="bg-primary/60 absolute inset-x-0 bottom-0 h-0.5" />}
          </button>
        );
      })}
    </div>
  );
}
