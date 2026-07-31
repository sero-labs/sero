import { describe, expect, it } from 'vitest';

import {
  cycleMs,
  elapsedAtFrame,
  elapsedLabel,
  frameMs,
  playbackOrder,
  positionAt,
  ticksOf,
} from './playback';

/**
 * Playback, at its real rate.
 *
 * The two things worth pinning down are the ones a viewer would notice and a
 * reviewer would not: that ping-pong does not show either end twice, and that a
 * frame held for four ticks is on screen four times as long as one held for one.
 * Both come out of the durations, so both are testable without a clock.
 */

describe('the order frames are shown in', () => {
  it('runs straight through for a sequence that plays once', () => {
    expect(playbackOrder(4, 'once')).toEqual([0, 1, 2, 3]);
    expect(playbackOrder(4, 'forward')).toEqual([0, 1, 2, 3]);
  });

  it('runs back down the inside for ping-pong, repeating neither end', () => {
    expect(playbackOrder(5, 'pingpong')).toEqual([0, 1, 2, 3, 4, 3, 2, 1]);
  });

  it('leaves a two frame ping-pong alone, because both frames are ends', () => {
    expect(playbackOrder(2, 'pingpong')).toEqual([0, 1]);
    expect(playbackOrder(1, 'pingpong')).toEqual([0]);
    expect(playbackOrder(0, 'pingpong')).toEqual([]);
  });
});

describe('a cycle', () => {
  it('is the sum of the durations it shows', () => {
    expect(cycleMs([100, 50, 25], 'forward')).toBe(175);
    // The return leg shows the middle frame a second time.
    expect(cycleMs([100, 50, 25], 'pingpong')).toBe(225);
  });

  it('never lets a zero duration stall the loop', () => {
    expect(frameMs(0)).toBe(1);
    expect(frameMs(Number.NaN)).toBe(1);
    expect(frameMs(undefined)).toBe(1);
    expect(cycleMs([0, 0], 'forward')).toBe(2);
  });
});

describe('where the playhead is', () => {
  const durations = [100, 50, 25];

  it('holds each frame for its own time', () => {
    expect(positionAt(durations, 'forward', 0).index).toBe(0);
    expect(positionAt(durations, 'forward', 99).index).toBe(0);
    expect(positionAt(durations, 'forward', 100).index).toBe(1);
    expect(positionAt(durations, 'forward', 149).index).toBe(1);
    expect(positionAt(durations, 'forward', 150).index).toBe(2);
  });

  it('wraps a looping animation', () => {
    expect(positionAt(durations, 'forward', 175).index).toBe(0);
    expect(positionAt(durations, 'forward', 276).index).toBe(1);
    expect(positionAt(durations, 'forward', 175).ended).toBe(false);
  });

  it('walks back down the return leg of a ping-pong', () => {
    // 175 ms in, the forward pass is over and the middle frame comes round again.
    expect(positionAt(durations, 'pingpong', 175).index).toBe(1);
    expect(positionAt(durations, 'pingpong', 225).index).toBe(0);
  });

  it('holds the last pose of a sequence that plays once, and says it ended', () => {
    expect(positionAt(durations, 'once', 400)).toEqual({ index: 2, ended: true });
    expect(positionAt(durations, 'once', 174).ended).toBe(false);
  });

  it('has nothing to show when there are no frames', () => {
    expect(positionAt([], 'forward', 10)).toEqual({ index: 0, ended: true });
  });
});

describe('seeking to a frame', () => {
  it('lands on where that frame first appears', () => {
    expect(elapsedAtFrame([100, 50, 25], 'forward', 2)).toBe(150);
    // The first appearance, not the one on the way back.
    expect(elapsedAtFrame([100, 50, 25], 'pingpong', 1)).toBe(100);
  });
});

describe('what the strip says', () => {
  it('counts how long a frame is held in ticks of the play rate', () => {
    expect(ticksOf(33, 30)).toBe(1);
    expect(ticksOf(66, 30)).toBe(2);
    expect(ticksOf(133, 30)).toBe(4);
    expect(ticksOf(83, 12)).toBe(1);
  });

  it('never claims a frame is held for no time at all', () => {
    expect(ticksOf(1, 30)).toBe(1);
    expect(ticksOf(33, 0)).toBe(1);
  });
});

describe('the transport clock', () => {
  it('reads in minutes, seconds and hundredths', () => {
    expect(elapsedLabel(170)).toBe('0:00.17');
    expect(elapsedLabel(61_500)).toBe('1:01.50');
    expect(elapsedLabel(-5)).toBe('0:00.00');
  });
});
