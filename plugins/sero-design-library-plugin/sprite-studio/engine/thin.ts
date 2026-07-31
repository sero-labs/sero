/**
 * From a dense sample to the frames that carry the movement (D23).
 *
 * A five second clip at 12 fps gives about sixty near-identical pictures; a
 * sprite needs about ten. The spike kept a frame when enough cells had changed
 * since the last one kept, which had three faults: it compared frames without
 * aligning them, so a one pixel drift counted as a large change; it could keep a
 * noisy frame and drop the wind-up, the strike or the recovery; and it threw the
 * source timing away.
 *
 * So four frames are kept unconditionally — the first, the last, and the two
 * extremes of the action, which are the poses an animator would draw first — and
 * the rest are chosen to lose as little of the movement as possible, judged on
 * the **silhouette** rather than on raw cell change, so noise cannot outrank a
 * wind-up.
 *
 * An extreme is found by measuring, not declared: it is where a limb or a held
 * object reverses direction. Small fast things are weighted up by measuring
 * reach from the root, so a whip that crosses the whole canvas registers as the
 * extreme it is.
 */

import { frameDifference } from './align';
import type { CellGrid } from './types';

export interface ThinOptions {
  /** How many frames to keep, including the four kept unconditionally. */
  keep: number;
  anchorCol: number;
  anchorRow: number;
  /** A forward loop's ends are the same moment, so only one of them is kept. */
  looping?: boolean;
}

export interface ThinnedFrame {
  /** Index into the dense sample. */
  index: number;
  /**
   * The real time this frame holds: the time until the next kept frame in the
   * source, so the animation plays at the speed it was drawn at.
   */
  durationMs: number;
}

/** How far the drawn matter reaches from the root, per frame. */
export function reachOf(frames: CellGrid[], anchorCol: number, anchorRow: number): number[] {
  return frames.map((frame) => {
    let far = 0;
    for (let y = 0; y < frame.rows; y++)
      for (let x = 0; x < frame.cols; x++)
        if ((frame.cells[y * frame.cols + x] ?? -1) >= 0) {
          const distance = Math.hypot(x - anchorCol, y - anchorRow);
          if (distance > far) far = distance;
        }
    return far;
  });
}

/** The frames where reach reverses direction — the wind-up and the strike. */
export function extremesOf(reach: number[]): number[] {
  const extremes: number[] = [];
  for (let i = 1; i < reach.length - 1; i++) {
    const before = (reach[i] ?? 0) - (reach[i - 1] ?? 0);
    const after = (reach[i + 1] ?? 0) - (reach[i] ?? 0);
    if ((before > 0 && after < 0) || (before < 0 && after > 0)) extremes.push(i);
  }
  return extremes;
}

export function thin(
  frames: CellGrid[],
  durations: number[],
  options: ThinOptions,
): ThinnedFrame[] {
  if (frames.length === 0) return [];
  const reach = reachOf(frames, options.anchorCol, options.anchorRow);

  // In a looping animation the first and last frame are the same moment, so the
  // last one is not a candidate at all — keeping it would draw that moment twice
  // and stall the cycle for a tick. Leaving it merely "not added by default"
  // was not enough: the filler below would pick it up again as the frame least
  // well represented, which is exactly what it is.
  const available = options.looping ? frames.length - 1 : frames.length;
  const last = available - 1;
  if (available <= 0) return [];

  const keep = new Set<number>([0]);
  if (!options.looping) keep.add(last);
  for (const extreme of extremesOf(reach)) if (extreme < available) keep.add(extreme);

  // Then whatever is represented worst by the frames already kept, judged on
  // the silhouette at the best alignment.
  const target = Math.min(options.keep, available);
  while (keep.size < target) {
    let worst = -1;
    let cost = -1;
    for (const [i, frame] of frames.entries()) {
      if (i >= available || keep.has(i)) continue;
      const nearest = [...keep].reduce((best, k) => (Math.abs(k - i) < Math.abs(best - i) ? k : best));
      const neighbour = frames[nearest];
      if (!neighbour) continue;
      const distance = frameDifference(frame, neighbour, { silhouetteOnly: true });
      if (distance > cost) {
        cost = distance;
        worst = i;
      }
    }
    if (worst < 0 || cost <= 0) break;
    keep.add(worst);
  }

  const kept = [...keep].toSorted((a, b) => a - b);
  return kept.map((index, position) => {
    // The real time until the next kept frame. The final frame of a loop covers
    // the join; the final frame of a one-shot holds its own duration.
    const next = kept[position + 1] ?? (options.looping ? frames.length : index + 1);
    let total = 0;
    for (let i = index; i < next; i++) total += durations[i] ?? 0;
    return { index, durationMs: Math.max(1, Math.round(total)) };
  });
}
