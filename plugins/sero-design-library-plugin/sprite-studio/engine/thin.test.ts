/**
 * How many frames a clip is worth, and what each one holds.
 *
 * The count used to be declared by the planner before anything was drawn, and
 * the selector kept exactly that many — which is how a resting loop came back
 * with six frames out of sixty-one. These are the rules that replaced it.
 */

import { describe, expect, it } from 'vitest';

import { MAX_FRAMES, durationsFor, extremesOf, handPickedDurations, thin } from './thin';
import { TRANSPARENT, type CellGrid } from './types';

/** A block `width` cells wide, so the silhouette changes by a known amount. */
function bar(width: number): CellGrid {
  const cols = 40;
  const rows = 10;
  const cells = new Int16Array(cols * rows).fill(TRANSPARENT);
  for (let y = 2; y < 8; y++) for (let x = 0; x < width; x++) cells[y * cols + x] = 0;
  return { cols, rows, cells };
}

describe('choosing how many frames', () => {
  it('stops once the next frame adds far less than the first one did', () => {
    // A big move, then a long tail of tiny ones. The tail is what used to be
    // kept anyway whenever the planner had asked for a large count.
    const frames = [bar(2), bar(30), ...Array.from({ length: 30 }, (_, i) => bar(30 + i * 0.1 | 0))];
    const kept = thin(frames, frames.map(() => 83), { anchorCol: 0, anchorRow: 5 });

    expect(kept.length).toBeGreaterThanOrEqual(2);
    expect(kept.length).toBeLessThan(frames.length / 2);
  });

  it('never keeps more than the cap, however much is happening', () => {
    // Every frame differs from every other one by a lot: without a cap this is
    // the clip that keeps all sixty.
    const frames = Array.from({ length: 60 }, (_, i) => bar(1 + ((i * 7) % 39)));
    const kept = thin(frames, frames.map(() => 83), { anchorCol: 0, anchorRow: 5 });

    expect(kept.length).toBeLessThanOrEqual(MAX_FRAMES);
  });

  it('adds nothing to a clip where nothing moves', () => {
    // The minimum does not override this. Padding a still clip with duplicates
    // is not the same as giving it more frames.
    const frames = Array.from({ length: 20 }, () => bar(10));
    const kept = thin(frames, frames.map(() => 83), { anchorCol: 0, anchorRow: 5 });

    expect(kept.length).toBe(2);
  });
});

describe('seeding the extremes', () => {
  it('ignores a reversal that is worth nothing', () => {
    // Reach wobbles by a hair all the way along and turns around properly once.
    // A walk seeded fifteen of these before the count was consulted at all,
    // which is why it kept sixteen frames against a plan of eight.
    const reach = [0, 10, 9.99, 10.02, 20, 30, 40, 39.98, 40.01, 50, 30, 10];
    const found = extremesOf(reach);

    expect(found).toContain(9);
    expect(found.length).toBeLessThanOrEqual(2);
  });

  it('takes only the largest few, so they cannot decide the count alone', () => {
    const reach = Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? 0 : 10 + i));
    expect(extremesOf(reach).length).toBeLessThanOrEqual(8);
  });
});

describe('the time each kept frame holds', () => {
  const durations = Array.from({ length: 10 }, () => 100);

  it('runs to the next frame kept, so dropping one lengthens the one before', () => {
    expect(durationsFor([0, 4, 7], durations)).toEqual([
      { index: 0, durationMs: 400 },
      { index: 4, durationMs: 300 },
      { index: 7, durationMs: 100 },
    ]);
  });

  it('lets the last frame of a cycle cover the join', () => {
    // The clip's own length, not the last frame's own tick: the cycle keeps the
    // length it was drawn at however many frames are taken out of it (D23).
    expect(durationsFor([0, 4], durations, { cycleEnd: 10 })).toEqual([
      { index: 0, durationMs: 400 },
      { index: 4, durationMs: 600 },
    ]);
  });

  it('keeps a trimmed loop the length the clip was', () => {
    // The head of the cycle is dropped, so the frame on screen while that time
    // passes is the last one. Without the wrap, trimming a loop silently made
    // it shorter — the animation sped up because a frame was removed, which is
    // the opposite of what taking the source timing means (D23).
    const held = durationsFor([4, 8], durations, { cycleEnd: 10 });
    expect(held.reduce((sum, frame) => sum + frame.durationMs, 0)).toBe(100 * 10);
  });

  it('loses no time when a frame is kept past where the cycle was cut', () => {
    // The cut is a suggestion drawn on a strip of the whole clip, so keeping a
    // frame beyond it is ordinary. Clamping the end to that frame dropped
    // every tick between the two.
    const held = durationsFor([0, 4, 8], durations, { cycleEnd: 10 });
    expect(held.reduce((sum, frame) => sum + frame.durationMs, 0)).toBe(100 * 10);
  });

  it('never gives the last frame a cycle that ended before it', () => {
    // The strip shows the whole clip and the loop cut is only a suggestion on
    // it, so a frame chosen past the cut is ordinary. Handed a cycle end
    // before its own index, the last frame used to be held for one
    // millisecond — a flash where a held pose should be.
    const held = durationsFor([0, 4, 8], durations, { cycleEnd: 6 });
    expect(held.at(-1)!.durationMs).toBeGreaterThan(1);
  });

  it('sorts and de-duplicates whatever it is handed', () => {
    // These indices come from a request, so they arrive in whatever order the
    // user clicked them in — and order is source order, by decision.
    expect(durationsFor([7, 0, 4, 4], durations).map((frame) => frame.index)).toEqual([0, 4, 7]);
  });
});

describe('the timing a hand-picked set gets', () => {
  const durations = Array.from({ length: 10 }, () => 100);

  it('is the whole clip, for anything that repeats', () => {
    // The review screen and the builder both call this, so a preview cannot
    // play at one speed while the sequence is built at another. The cycle ends
    // at the end of the clip, not at the last frame kept.
    const held = handPickedDurations([2, 5], durations, 'forward');
    expect(held.reduce((sum, frame) => sum + frame.durationMs, 0)).toBe(1000);
    expect(handPickedDurations([2, 5], durations, 'pingpong')).toEqual(held);
  });

  it('is each frame until the next one, for a sequence that plays once', () => {
    const held = handPickedDurations([2, 5], durations, 'once');
    expect(held).toEqual([
      { index: 2, durationMs: 300 },
      { index: 5, durationMs: 100 },
    ]);
  });

  it('ignores an index the clip does not have', () => {
    // The indices come off a strip that is redrawn by a redo, so a stale one
    // is possible and must not become a frame of nothing.
    expect(handPickedDurations([1, 99, -1], durations, 'once').map((f) => f.index)).toEqual([1]);
  });
});
