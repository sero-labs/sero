/**
 * Clip timing — the part of the engine a game calls (spec §16).
 *
 * The studio and a game runtime must agree about which frame is on screen at a
 * given moment, so there is one implementation of that question and both use it.
 * A sheet that disagrees with the played sprite is a bug nobody can see until it
 * ships.
 *
 * Nothing here reads a clock. Time arrives as a number of milliseconds from the
 * caller, which is what makes playback testable and a compile deterministic.
 */

import type { Grid } from './grid';
import { resolveFrame } from './resolve';
import { findClip, findFrame, type Clip, type PixelProject } from './schema';

export interface Playhead {
  /** Position in the clip's own frame list. */
  index: number;
  frameId: string;
  /** True once a clip that plays `once` has reached its end and stopped. */
  finished: boolean;
}

export function clipDurationMs(clip: Clip): number {
  return playbackOrder(clip).reduce((total, position) => total + (clip.frames[position]?.durationMs ?? 0), 0);
}

/**
 * The order the frames are actually shown in.
 *
 * Ping-pong walks back through the middle frames only: repeating the two ends
 * would hold them for twice as long and read as a stutter at each turn.
 */
export function playbackOrder(clip: Clip): number[] {
  const forward = clip.frames.map((_, index) => index);
  if (clip.loop !== 'ping-pong' || forward.length < 3) return forward;
  return [...forward, ...forward.slice(1, -1).reverse()];
}

export function frameAt(clip: Clip, elapsedMs: number): Playhead | null {
  const order = playbackOrder(clip);
  if (order.length === 0) return null;

  const total = clipDurationMs(clip);
  const clamped = Math.max(0, elapsedMs);
  const finished = clip.loop === 'once' && clamped >= total;
  // A clip that plays once holds its last frame for ever; anything else wraps.
  let remaining = total === 0 ? 0 : finished ? total - 1 : clamped % total;

  for (const position of order) {
    const duration = clip.frames[position]?.durationMs ?? 0;
    if (remaining < duration) return { index: position, frameId: clip.frames[position].frameId, finished };
    remaining -= duration;
  }
  const last = order[order.length - 1];
  return { index: last, frameId: clip.frames[last].frameId, finished };
}

/**
 * The pixels on screen at a moment, straight from the project.
 *
 * This is the path that lets `project.json` play with no sheet present: resolve
 * the frame the playhead names and hand back its grid.
 */
export function spriteAt(project: PixelProject, clipId: string, elapsedMs: number): Grid | null {
  const clip = findClip(project, clipId);
  if (clip === undefined) return null;
  const playhead = frameAt(clip, elapsedMs);
  if (playhead === null) return null;
  const frame = findFrame(project, playhead.frameId);
  return frame === undefined ? null : resolveFrame(project, frame);
}
