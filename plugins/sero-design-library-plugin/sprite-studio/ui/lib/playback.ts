/**
 * Playing a finished animation at its real rate (D23).
 *
 * Every frame carries the time it held in the source, and that timing is kept
 * on purpose rather than being replaced by a rate worked out afterwards. So
 * playback walks the durations rather than dividing a second by the frame
 * count, and a sequence that holds its last pose still holds it here.
 *
 * All of this is arithmetic over a list of durations. The clock that drives it
 * lives in `hooks/usePlayback.ts`, which is what keeps this testable without
 * one.
 */

import type { LoopMode } from '../../shared/character';

/** A frame that cannot advance the clock would spin the loop for ever. */
const MIN_FRAME_MS = 1;

export function frameMs(durationMs: number | undefined): number {
  return durationMs === undefined || !Number.isFinite(durationMs)
    ? MIN_FRAME_MS
    : Math.max(MIN_FRAME_MS, durationMs);
}

/**
 * The order frames are shown in, as indexes into the frame list.
 *
 * Ping-pong runs forward and then back down the *inside*: both ends are shared
 * with the pass that follows, and showing either of them twice is the stutter
 * people notice. That is also why it cannot fail to join (D34).
 */
export function playbackOrder(frameCount: number, loop: LoopMode): number[] {
  if (frameCount <= 0) return [];
  const forward = Array.from({ length: frameCount }, (_, index) => index);
  if (loop !== 'pingpong') return forward;
  const back = Array.from({ length: Math.max(0, frameCount - 2) }, (_, step) => frameCount - 2 - step);
  return [...forward, ...back];
}

/** How long one pass takes, ping-pong's return leg included. */
export function cycleMs(durations: readonly number[], loop: LoopMode): number {
  return playbackOrder(durations.length, loop).reduce(
    (total, index) => total + frameMs(durations[index]),
    0,
  );
}

export interface PlaybackPosition {
  /** Index into the animation's frames. */
  index: number;
  /** True once an animation that plays `once` has run past its last frame. */
  ended: boolean;
}

/** Which frame is on screen after `elapsedMs` of playing. */
export function positionAt(
  durations: readonly number[],
  loop: LoopMode,
  elapsedMs: number,
): PlaybackPosition {
  const order = playbackOrder(durations.length, loop);
  const last = order.at(-1);
  if (last === undefined) return { index: 0, ended: true };

  const cycle = cycleMs(durations, loop);
  const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  // A sequence that plays once holds its last pose rather than wrapping, and
  // says so — that is what stops the transport from looking stuck.
  if (loop === 'once' && elapsed >= cycle) return { index: last, ended: true };

  let remaining = loop === 'once' ? elapsed : elapsed % cycle;
  for (const index of order) {
    const ms = frameMs(durations[index]);
    if (remaining < ms) return { index, ended: false };
    remaining -= ms;
  }
  return { index: last, ended: loop === 'once' };
}

/** Where in the cycle a frame first appears, so selecting one seeks to it. */
export function elapsedAtFrame(
  durations: readonly number[],
  loop: LoopMode,
  frameIndex: number,
): number {
  let elapsed = 0;
  for (const index of playbackOrder(durations.length, loop)) {
    if (index === frameIndex) return elapsed;
    elapsed += frameMs(durations[index]);
  }
  return 0;
}

/**
 * A frame's hold in ticks of the play rate.
 *
 * Frame count and play rate are separate things: 30 fps is how fast it plays,
 * not how many drawings exist, and the strip says how many ticks each drawing
 * is held for.
 */
export function ticksOf(durationMs: number, playRate: number): number {
  if (!Number.isFinite(playRate) || playRate <= 0) return 1;
  return Math.max(1, Math.round((frameMs(durationMs) * playRate) / 1000));
}

/** The transport clock: minutes, seconds and hundredths. */
export function elapsedLabel(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.round(ms) : 0;
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const hundredths = Math.floor((total % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}
