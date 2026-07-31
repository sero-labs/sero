import { Pencil, Plus } from 'lucide-react';

import type { AnimationRecord } from '../../shared/character';
import { ticksOf } from '../lib/playback';
import { CHECKER_STYLE, SpritePixels, fitScale } from './SpritePixels';

/**
 * The frames, at working size.
 *
 * Every frame carries how long it is held, in ticks of the play rate, because
 * that is the difference between six drawings that read as a resting loop and
 * six drawings that flicker. A repaired or hand-edited frame says so on its
 * face: the run does not stop to ask permission for a repair, so the strip is
 * where a repair becomes visible.
 */

const TILE = { width: 96, thumb: 78 };

interface FrameStripProps {
  animation: AnimationRecord;
  selectedIndex: number;
  onSelect(index: number): void;
  onEdit(frameId: string): void;
  onAddFrame(): void;
}

export function FrameStrip({
  animation,
  selectedIndex,
  onSelect,
  onEdit,
  onAddFrame,
}: FrameStripProps) {
  const { canvas, frames, plan } = animation;
  const scale = fitScale(canvas.cols, canvas.rows, TILE.width - 10, TILE.thumb - 6);

  return (
    <div className="border-border bg-card flex shrink-0 items-start gap-2 overflow-x-auto border-t px-3 py-2.5">
      {frames.map((frame, index) => (
        <div
          key={frame.id}
          className={`group relative w-24 shrink-0 overflow-hidden rounded-md border ${
            index === selectedIndex ? 'border-primary ring-primary/25 ring-1' : 'border-border'
          }`}
        >
          <button
            type="button"
            className="grid w-full place-items-center overflow-hidden"
            style={{ height: TILE.thumb, ...CHECKER_STYLE }}
            onClick={() => onSelect(index)}
            onDoubleClick={() => onEdit(frame.id)}
            aria-label={`Frame ${index + 1}${frame.label === undefined ? '' : `, ${frame.label}`}`}
            aria-current={index === selectedIndex}
          >
            <SpritePixels
              path={frame.file}
              cols={canvas.cols}
              rows={canvas.rows}
              scale={scale}
              alt=""
            />
          </button>
          <button
            type="button"
            onClick={() => onEdit(frame.id)}
            aria-label={`Edit frame ${index + 1}`}
            className="border-border bg-background/90 absolute top-1 left-1 hidden items-center gap-1 rounded border px-1 py-px font-mono text-xs group-hover:flex focus:flex"
          >
            <Pencil className="size-2.5" />
            edit
          </button>
          {frame.provenance.repairs > 0 && (
            <span className="absolute top-1 right-1 rounded bg-violet-400/20 px-1 py-px font-mono text-xs text-violet-300">
              fixed
            </span>
          )}
          {frame.provenance.kind === 'hand-edited' && (
            <span className="bg-primary/15 text-primary absolute top-1 right-1 rounded px-1 py-px font-mono text-xs">
              edited
            </span>
          )}
          <div className="border-border text-muted-foreground flex h-6 items-center justify-between border-t px-1.5 font-mono text-xs">
            <span>{index + 1}</span>
            <span>{ticksOf(frame.durationMs, plan.playRate)}t</span>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={onAddFrame}
        className="border-border text-muted-foreground hover:text-foreground grid h-24 w-24 shrink-0 place-items-center rounded-md border border-dashed text-sm"
      >
        <span className="flex items-center gap-1">
          <Plus className="size-3.5" />
          frame
        </span>
      </button>
    </div>
  );
}
