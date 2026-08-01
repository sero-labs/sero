import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sero-ai/ui';
import { Pause, Play } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useElementSize } from '../../../ui/hooks/useElementSize';
import { handPickedDurations } from '../../engine/thin';
import type { LoopMode } from '../../shared/character';
import { sampleName } from '../../shared/paths';
import { usePlayback } from '../hooks/usePlayback';
import { CHECKER_STYLE, SpritePixels, fitScale } from './SpritePixels';

/**
 * The chosen frames, playing, beside the clip they came out of.
 *
 * The clip is the take; this is the sprite. They are different things and the
 * judgement needs both — a take can look right at 480p and fall apart at
 * 62 × 136, and a set of frames can be sound while the clip around them is not.
 * So they sit side by side and both play.
 *
 * **The timing is the build's timing, from the build's own function.** A frame
 * holds until the next one kept, so dropping a near-duplicate lengthens the
 * frame before it (D23) — which means an evenly spaced preview would be a
 * different animation from the one the button underneath builds. `durationsFor`
 * is called here exactly as `assemble` calls it for a hand-picked set, so the
 * two cannot drift apart.
 */

/** Play at the clip's own speed, which is what will be built. */
const AS_TIMED = 'timed';
/** Flat rates, for reading the movement at a speed the clip was not shot at. */
const FLAT_RATES = [6, 8, 12, 15, 24, 30];

const LOOP_LABEL: Record<LoopMode, string> = {
  forward: 'Loops',
  pingpong: 'Ping-pong',
  once: 'Plays once',
};

interface LoopPreviewProps {
  previewDir: string;
  /** When the previews were drawn, so a redo does not paint the old clip. */
  version: number;
  /** Every moment in the clip, for the timing the chosen frames inherit. */
  sampleDurationsMs: readonly number[];
  canvas: { cols: number; rows: number };
  /** Source order, as the build takes them. */
  chosen: readonly number[];
  /**
   * How the build will play it, which is not always how it was planned.
   *
   * A forward loop is only offered where the search found a real cycle (D34);
   * where it did not, the build falls back to playing once. Opening on the plan
   * would show a seamless loop that is not going to be made.
   */
  loop: LoopMode;
}

export function LoopPreview({
  previewDir,
  version,
  sampleDurationsMs,
  canvas,
  chosen,
  loop: planned,
}: LoopPreviewProps) {
  const [loop, setLoop] = useState<LoopMode>(planned);
  const [rate, setRate] = useState<string>(AS_TIMED);
  const { ref, width, height } = useElementSize<HTMLDivElement>();

  const frames = useMemo(
    () => handPickedDurations(chosen, sampleDurationsMs, loop),
    [chosen, sampleDurationsMs, loop],
  );
  const durations = useMemo(
    () =>
      rate === AS_TIMED
        ? frames.map((frame) => frame.durationMs)
        : frames.map(() => 1000 / Number(rate)),
    [frames, rate],
  );

  const playback = usePlayback(durations, loop, { autoPlay: true });
  const frame = frames[playback.index];
  // `pb-14` is what keeps the sprite clear of the transport: the measured size
  // is the content box, so the bar's room is already out of `height` and the
  // picture centres in what is left rather than behind the controls.
  const scale = fitScale(canvas.cols, canvas.rows, width, height);

  return (
    <div
      ref={ref}
      className="relative grid min-h-0 flex-1 place-items-center pb-14"
      style={CHECKER_STYLE}
    >
      {frame === undefined ? (
        <p className="text-muted-foreground text-sm">Keep a frame to see it play.</p>
      ) : (
        <SpritePixels
          path={`${previewDir}/${sampleName(frame.index)}.png`}
          version={version}
          cols={canvas.cols}
          rows={canvas.rows}
          scale={scale}
          alt={`Frame ${playback.index + 1} of the chosen set`}
        />
      )}

      <div className="border-border bg-background/90 absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border px-2.5 py-1.5">
        <button
          type="button"
          onClick={playback.toggle}
          aria-label={playback.playing ? 'Pause' : 'Play'}
          disabled={frames.length === 0}
          className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-md disabled:opacity-40"
        >
          {playback.playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </button>
        <span className="text-muted-foreground font-mono text-xs whitespace-nowrap tabular-nums">
          {frames.length === 0 ? '0 / 0' : `${playback.index + 1} / ${frames.length}`}
        </span>
        <Select value={loop} onValueChange={(value) => setLoop(value as LoopMode)}>
          <SelectTrigger className="h-7 w-28" aria-label="How it plays">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(LOOP_LABEL) as LoopMode[]).map((mode) => (
              <SelectItem key={mode} value={mode}>
                {LOOP_LABEL[mode]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={rate} onValueChange={setRate}>
          <SelectTrigger className="h-7 w-28" aria-label="Speed">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {/* First, and the default: the speed the clip was drawn at is the
                speed it will be built at. */}
            <SelectItem value={AS_TIMED}>As timed</SelectItem>
            {FLAT_RATES.map((fps) => (
              <SelectItem key={fps} value={String(fps)}>
                {fps} fps
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
