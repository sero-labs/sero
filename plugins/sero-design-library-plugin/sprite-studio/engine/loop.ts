/**
 * Finding a loop, and being honest when there is not one (D32, D34).
 *
 * The first method chose a cycle *length* first, by how well the whole clip
 * repeated at that spacing, and only then chose where to start. That discards
 * good loops, because a clip can hold one excellent pair of matching moments
 * without repeating at any fixed spacing at all.
 *
 * Searching every start and end pair asks the only question that matters: play
 * from s to e, jump back to s, how big is the jump? Measured across five walks
 * it was better or equal everywhere, and on the slime it halved both the frame
 * count and the error.
 *
 * A bridge — borrowing a short run of frames to lead out of the end and back
 * into the start — was tested on all five walks for lengths one to four, from
 * anywhere in the clip, and **no bridge beat jumping straight back** (D33). It
 * is not implemented here, and this comment is why it should not be tried again.
 */

import { frameDifference, rawDifference } from './align';
import type { CellGrid, LoopMode } from './types';

/** Below this share of the sprite differing, a forward loop reads as closed. */
export const LOOP_CLEAN = 0.12;
/** Above this, no amount of cutting will hide the jump. */
export const LOOP_HOPELESS = 0.25;

export interface LoopCandidate {
  start: number;
  end: number;
  length: number;
  /** The share of the sprite that differs across the join, 0 to 1. */
  cost: number;
}

export interface LoopSearch {
  /** The best pair the clip can make on its own, or null when it is too short. */
  best: LoopCandidate | null;
  /** The next few, so the user can take a longer cycle at a small extra cost. */
  alternatives: LoopCandidate[];
  /**
   * What the tool should say. `forward` only when a real cycle was found;
   * `pingpong` always joins because both ends are the same frame; `none` means
   * the honest answer is to generate it again, ping-pong it, or fix it by hand.
   */
  verdict: 'forward' | 'pingpong' | 'none';
}

/** Every start and end pair, cheapest join first. */
export function searchLoop(frames: CellGrid[], { minLength = 6, keep = 5 } = {}): LoopSearch {
  const n = frames.length;
  const candidates: LoopCandidate[] = [];
  for (let s = 0; s < n; s++)
    for (let e = s + minLength; e < n; e++) {
      const from = frames[s];
      const to = frames[e];
      if (!from || !to) continue;
      candidates.push({ start: s, end: e, length: e - s + 1, cost: rawDifference(from, to) });
    }
  candidates.sort((a, b) => a.cost - b.cost);

  const best = candidates[0] ?? null;
  return {
    best,
    alternatives: candidates.slice(1, keep),
    verdict: best === null ? 'none' : best.cost <= LOOP_CLEAN ? 'forward' : 'none',
  };
}

/**
 * How far the last frame is from the first, for an animation meant to loop.
 *
 * Measured at the best alignment, because a sprite shifted by one pixel differs
 * everywhere and the offset is itself the answer to how far it drifted.
 */
export function loopClosure(frames: CellGrid[]): number {
  const first = frames[0];
  const last = frames.at(-1);
  if (!first || !last || frames.length < 2) return 0;
  return frameDifference(first, last, { radius: 2 });
}

/**
 * The play order for a mode.
 *
 * Ping-pong plays forward then backward without repeating either end, so the
 * join cannot fail — it costs the motion its direction, which suits breathing,
 * hovering and bouncing and does not suit a walk. A forward loop's first and
 * last frame are the same moment, so only one of them is kept and its duration
 * covers the join (D23).
 */
export function playOrder(count: number, mode: LoopMode): number[] {
  const forward = Array.from({ length: count }, (_, i) => i);
  if (mode !== 'pingpong' || count < 3) return forward;
  return [...forward, ...forward.slice(1, -1).toReversed()];
}

/** What to tell the user when a forward loop was asked for and none exists. */
export function loopAdvice(search: LoopSearch): string {
  if (search.verdict === 'forward') return '';
  const cost = search.best === null ? null : Math.round(search.best.cost * 100);
  const measured =
    cost === null
      ? 'This clip is too short to cut a cycle out of.'
      : `The closest this clip comes to repeating a pose is ${cost}% of the sprite changing across the join.`;
  return `${measured} It cannot be looped forward by any means after the fact. Generate it again, ping-pong it and accept the reversed motion, or fix it by hand.`;
}
