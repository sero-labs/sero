/**
 * The playback core: frame timing over a baked clip. Renderer-agnostic — the
 * player owns WHICH frame is current; the caller draws it however it likes
 * (canvas, terminal, encoder). No clocks in here: the caller feeds elapsed
 * time in, which is what keeps playback testable and deterministic.
 */

import type { BakedClip } from './spec';

export class ClipPlayer {
  private clip: BakedClip;
  private accum = 0;
  /** Current frame index into `clip.frames`. */
  frame = 0;
  playing = true;

  constructor(clip: BakedClip) {
    this.clip = clip;
  }

  /** Swap the playing clip; restarts at frame 0. */
  set(clip: BakedClip): void {
    this.clip = clip;
    this.frame = 0;
    this.accum = 0;
  }

  current(): BakedClip {
    return this.clip;
  }

  /** Advance by `dt` seconds; returns the (possibly new) frame index. A
   * non-looping clip holds on its last frame. Arithmetic, not a drain loop:
   * a bad fps or dt skips the advance instead of spinning forever. */
  advance(dt: number): number {
    const n = this.clip.frames.length;
    const spf = 1 / this.clip.fps;
    if (!this.playing || n === 0 || !(spf > 0) || !(dt > 0)) return this.frame;
    this.accum += dt;
    const steps = Math.floor(this.accum / spf);
    if (steps <= 0) return this.frame;
    this.accum -= steps * spf;
    if (this.clip.loop) {
      this.frame = (this.frame + steps) % n;
    } else {
      this.frame = Math.min(this.frame + steps, n - 1);
      if (this.frame === n - 1) this.accum = 0;
    }
    return this.frame;
  }
}
