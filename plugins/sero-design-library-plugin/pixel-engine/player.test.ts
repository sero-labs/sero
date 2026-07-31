import { describe, expect, it } from 'vitest';

import { encodeGrid } from './grid';
import { clipDurationMs, frameAt, playbackOrder, spriteAt } from './player';
import { resolveFrame } from './resolve';
import type { Clip } from './schema';
import { knightProject } from './testing/fixtures';

const clip = (loop: Clip['loop'], durations: number[]): Clip => ({
  id: 'c',
  name: 'Clip',
  loop,
  motionBudgetPx: 3,
  frames: durations.map((durationMs, index) => ({ frameId: `f${index}`, durationMs })),
});

describe('clip timing', () => {
  it('holds each frame for its own duration', () => {
    const walk = clip('loop', [100, 200, 100]);
    expect(frameAt(walk, 0)?.index).toBe(0);
    expect(frameAt(walk, 99)?.index).toBe(0);
    expect(frameAt(walk, 100)?.index).toBe(1);
    expect(frameAt(walk, 299)?.index).toBe(1);
    expect(frameAt(walk, 300)?.index).toBe(2);
    expect(clipDurationMs(walk)).toBe(400);
  });

  it('wraps a looping clip round for ever', () => {
    const walk = clip('loop', [100, 100]);
    expect(frameAt(walk, 200)?.index).toBe(0);
    expect(frameAt(walk, 1_000_150)?.index).toBe(1);
    expect(frameAt(walk, 250)?.finished).toBe(false);
  });

  it('holds the last frame of a clip that plays once, and says it finished', () => {
    const attack = clip('once', [100, 100]);
    expect(frameAt(attack, 150)).toEqual({ index: 1, frameId: 'f1', finished: false });
    expect(frameAt(attack, 200)).toEqual({ index: 1, frameId: 'f1', finished: true });
    expect(frameAt(attack, 10_000)).toEqual({ index: 1, frameId: 'f1', finished: true });
  });

  it('walks a ping-pong clip back through its middle frames only', () => {
    expect(playbackOrder(clip('ping-pong', [10, 10, 10, 10]))).toEqual([0, 1, 2, 3, 2, 1]);
    // Holding each end twice would read as a stutter at the turn.
    expect(playbackOrder(clip('ping-pong', [10, 10]))).toEqual([0, 1]);
    expect(clipDurationMs(clip('ping-pong', [10, 10, 10, 10]))).toBe(60);
    // 45ms is inside the fifth slot of [0,1,2,3,2,1] — on the way back.
    expect(frameAt(clip('ping-pong', [10, 10, 10, 10]), 45)?.index).toBe(2);
    expect(frameAt(clip('ping-pong', [10, 10, 10, 10]), 55)?.index).toBe(1);
  });

  it('treats time before the start as the start', () => {
    expect(frameAt(clip('loop', [100, 100]), -50)?.index).toBe(0);
  });

  it('has nothing to show for a clip with no frames', () => {
    expect(frameAt(clip('loop', []), 0)).toBeNull();
  });
});

describe('playing a project with no sheet', () => {
  it('resolves the frame the playhead names', () => {
    const project = knightProject();
    const grid = spriteAt(project, 'walk', 130);
    expect(grid).not.toBeNull();
    expect(encodeGrid(grid ?? [])).toEqual(encodeGrid(resolveFrame(project, project.frames[2])));
  });

  it('returns nothing for a clip the project does not have', () => {
    expect(spriteAt(knightProject(), 'sprint', 0)).toBeNull();
  });
});
