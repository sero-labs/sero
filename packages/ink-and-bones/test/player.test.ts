import { describe, expect, it } from 'vitest';
import type { BakedClip } from '../src/index';
import { ClipPlayer, Img } from '../src/index';

function clip(frames: number, fps: number, loop: boolean): BakedClip {
  return {
    name: 't',
    frames: Array.from({ length: frames }, () => new Img(1, 1)),
    fps,
    loop,
  };
}

describe('player', () => {
  it('advances on frame boundaries and loops', () => {
    // fps 8 -> 0.125 s/frame: binary-exact, so no float hair in the test
    const p = new ClipPlayer(clip(4, 8, true));
    expect(p.advance(0.0625)).toBe(0);
    expect(p.advance(0.0625)).toBe(1);
    expect(p.advance(0.375)).toBe(0); // 3 more frames: 2, 3, wrap to 0
  });

  it('a non-loop holds on its last frame', () => {
    const p = new ClipPlayer(clip(3, 10, false));
    p.advance(1.0);
    expect(p.frame).toBe(2);
    p.advance(1.0);
    expect(p.frame).toBe(2);
  });

  it('pausing freezes the frame', () => {
    const p = new ClipPlayer(clip(4, 10, true));
    p.playing = false;
    expect(p.advance(1.0)).toBe(0);
  });

  it('set() swaps the clip and restarts', () => {
    const p = new ClipPlayer(clip(4, 10, true));
    p.advance(0.25);
    p.set(clip(2, 5, true));
    expect(p.frame).toBe(0);
  });
});
