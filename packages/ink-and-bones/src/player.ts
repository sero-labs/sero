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
   * non-looping clip holds on its last frame. */
  advance(dt: number): number {
    if (!this.playing || this.clip.frames.length === 0) return this.frame;
    this.accum += dt;
    const spf = 1 / this.clip.fps;
    while (this.accum >= spf) {
      this.accum -= spf;
      if (this.frame + 1 < this.clip.frames.length) {
        this.frame += 1;
      } else if (this.clip.loop) {
        this.frame = 0;
      } else {
        this.accum = 0;
      }
    }
    return this.frame;
  }
}
