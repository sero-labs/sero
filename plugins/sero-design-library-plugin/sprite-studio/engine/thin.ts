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
 *
 * **How many frames is measured from the clip, not declared before it.** The
 * planner used to name a count before anything was drawn and the selector kept
 * exactly that many, which is how a resting loop came back with six frames out
 * of sixty-one. The rule below is the one that survived measurement; §5.8 of
 * `docs/features/sprite-studio/review-gate.md` records what was tried and why a
 * single fixed threshold was rejected.
 */

import { frameDifference } from './align';
import type { CellGrid } from './types';

/** Below this, a sequence is too sparse to read as movement at all. */
export const MIN_FRAMES = 4;
/** Above this, nobody is hand-editing the result and no sprite sheet wants it. */
export const MAX_FRAMES = 24;

/**
 * When to stop adding frames, as a share of what the first addition was worth.
 *
 * Not an absolute threshold. The quantity measured — how different the
 * worst-represented frame is from its nearest kept frame — is not comparable
 * between clips: the first addition is worth 32% of the canvas on a resting
 * loop, 52% on a whip attack and 100% on a jump. Any absolute threshold loose
 * enough for the resting loop pins every energetic clip to `MAX_FRAMES`, so
 * "the clip decides" quietly becomes "the cap decides".
 */
export const WORTH_KEEPING = 0.6;

/** How small a reversal may be and still count, as a share of the whole range. */
export const EXTREME_SHARE = 0.05;
/** The most extremes that may be seeded, so they cannot decide the count alone. */
export const MAX_EXTREMES = 8;

export interface ThinOptions {
  anchorCol: number;
  anchorRow: number;
  /** A forward loop's ends are the same moment, so only one of them is kept. */
  looping?: boolean;
  /** Bounds on the count. The clip decides within them. */
  min?: number;
  max?: number;
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

/**
 * The frames where reach reverses direction — the wind-up and the strike.
 *
 * A reversal has to be worth something, and there is a limit to how many are
 * taken. Without both, a walk seeded fifteen extremes before the count was
 * consulted at all, which is why it kept sixteen frames against a plan of
 * eight: every wobble of a foot counted as an extreme of the action.
 */
export function extremesOf(
  reach: number[],
  { share = EXTREME_SHARE, cap = MAX_EXTREMES } = {},
): number[] {
  if (reach.length < 3 || cap <= 0) return [];
  const span = Math.max(...reach) - Math.min(...reach);
  const found: { index: number; size: number }[] = [];
  for (let i = 1; i < reach.length - 1; i++) {
    const before = (reach[i] ?? 0) - (reach[i - 1] ?? 0);
    const after = (reach[i + 1] ?? 0) - (reach[i] ?? 0);
    if (!((before > 0 && after < 0) || (before < 0 && after > 0))) continue;
    // The smaller of the two sides: a reversal is only as big as the shallower
    // of the approach and the retreat.
    const size = Math.min(Math.abs(before), Math.abs(after));
    if (span > 0 && size < span * share) continue;
    found.push({ index: i, size });
  }
  return found
    .toSorted((a, b) => b.size - a.size)
    .slice(0, cap)
    .map((entry) => entry.index)
    .toSorted((a, b) => a - b);
}

/**
 * The real time each kept frame holds.
 *
 * One rule in one place, because two paths need it: the selector below, and the
 * frames a user picked by hand at the review. A frame holds until the next one
 * kept; the last frame of a cycle covers the join, and the last frame of a
 * one-shot holds its own tick.
 *
 * Dropping a near-duplicate therefore lengthens the frame before it rather than
 * shortening the animation. The timing belongs to the clip (D23), so a sequence
 * keeps the length it was drawn at however many frames are taken out of it.
 */
export function durationsFor(
  indices: readonly number[],
  durations: readonly number[],
  { cycleEnd }: { cycleEnd?: number } = {},
): ThinnedFrame[] {
  const kept = [...new Set(indices)].toSorted((a, b) => a - b);
  // A cycle cannot end before the last frame in it. The caller's idea of where
  // the cycle ends comes from the loop search, and a user picking frames off
  // the strip is free to keep one past that point — which left the final frame
  // holding for a single millisecond, a flash where a held pose should be.
  const ends = Math.max(cycleEnd ?? 0, (kept.at(-1) ?? 0) + 1);
  const sum = (from: number, to: number): number => {
    let total = 0;
    for (let i = from; i < to; i++) total += durations[i] ?? 0;
    return total;
  };

  return kept.map((index, position) => {
    const next = kept[position + 1];
    if (next !== undefined) return { index, durationMs: Math.max(1, Math.round(sum(index, next))) };
    // The last frame of a one-shot holds its own tick. The last frame of a
    // cycle holds to the end of the cycle **and then round to the first frame
    // kept** — the time before that frame is still part of the cycle, and it
    // is this frame that is on screen for it. Without the wrap, trimming the
    // head off a loop silently shortened it.
    const held =
      cycleEnd === undefined ? sum(index, index + 1) : sum(index, ends) + sum(0, kept[0] ?? 0);
    return { index, durationMs: Math.max(1, Math.round(held)) };
  });
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

  const max = Math.max(2, Math.min(options.max ?? MAX_FRAMES, available));
  const min = Math.min(options.min ?? MIN_FRAMES, max, available);

  const keep = new Set<number>([0]);
  if (!options.looping) keep.add(last);
  // Never more seeds than the count allows, or the extremes decide it alone.
  for (const extreme of extremesOf(reach, { cap: Math.min(MAX_EXTREMES, Math.max(0, max - 2)) })) {
    if (extreme < available) keep.add(extreme);
  }

  // Then whatever is represented worst by the frames already kept, judged on
  // the silhouette at the best alignment, for as long as the next one is still
  // worth having beside the first one that was.
  let firstWorth = 0;
  while (keep.size < max) {
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
    // Nothing left that differs at all: adding it would repeat a drawing. The
    // minimum does not override this — padding a still clip with duplicates is
    // not the same as giving it more frames.
    if (worst < 0 || cost <= 0) break;
    if (firstWorth === 0) firstWorth = cost;
    else if (keep.size >= min && cost < firstWorth * WORTH_KEEPING) break;
    keep.add(worst);
  }

  return durationsFor([...keep], durations, {
    ...(options.looping === true ? { cycleEnd: frames.length } : {}),
  });
}
