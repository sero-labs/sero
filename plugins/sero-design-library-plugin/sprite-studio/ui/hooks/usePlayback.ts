import { useEffect, useRef, useState } from 'react';

import type { LoopMode } from '../../shared/character';
import { cycleMs, elapsedAtFrame, positionAt } from '../lib/playback';

/**
 * The clock behind playback.
 *
 * A frame-timed loop rather than an interval per frame: the durations are the
 * source's own and they are not multiples of anything, so an interval would
 * round every one of them. Elapsed time advances and the frame is worked out
 * from it, which also means the transport can show a real position.
 *
 * The arithmetic lives in `lib/playback.ts`. This only turns wall time into
 * elapsed time.
 */

export const PLAY_SPEEDS = [0.5, 1, 2] as const;

export interface Playback {
  /** Index into the animation's frames. */
  index: number;
  playing: boolean;
  elapsedMs: number;
  cycleMs: number;
  speed: number;
  toggle(): void;
  /** Jump to a frame and hold there. */
  seek(frameIndex: number): void;
  cycleSpeed(): void;
}

export function usePlayback(durations: readonly number[], loop: LoopMode): Playback {
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState(1);

  // Read inside the frame loop rather than depended on: the durations array is
  // rebuilt whenever the record is re-read, and restarting the loop for that
  // would drop the playhead back to where it started mid-play.
  const timing = useRef({ durations, loop });
  useEffect(() => {
    timing.current = { durations, loop };
  });

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const step = (now - last) * speed;
      last = now;
      setElapsed((current) => {
        const next = current + step;
        const { durations: held, loop: mode } = timing.current;
        // A sequence that plays once stops itself at the end rather than
        // sitting there burning frames.
        if (mode === 'once' && next >= cycleMs(held, mode)) {
          setPlaying(false);
          return cycleMs(held, mode);
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed]);

  const position = positionAt(durations, loop, elapsed);

  return {
    index: position.index,
    playing,
    elapsedMs: elapsed,
    cycleMs: cycleMs(durations, loop),
    speed,
    toggle: () => {
      // Playing on from a finished sequence starts it again, which is what the
      // button plainly means when the last frame is on screen.
      if (!playing && position.ended) setElapsed(0);
      setPlaying((current) => !current);
    },
    seek: (frameIndex) => {
      setPlaying(false);
      setElapsed(elapsedAtFrame(durations, loop, frameIndex));
    },
    cycleSpeed: () =>
      setSpeed((current) => {
        const at = PLAY_SPEEDS.indexOf(current as (typeof PLAY_SPEEDS)[number]);
        return PLAY_SPEEDS[(at + 1) % PLAY_SPEEDS.length] ?? 1;
      }),
  };
}
