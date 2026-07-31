/**
 * The seven known-answer checks the spike ran, ported.
 *
 * Each one is material whose right answer is chosen here: a jump of a size we
 * picked, a cycle of a length we picked, noise we added, a relighting we
 * applied. A real clip cannot test this code, because nobody knows what the
 * right result is for a real clip.
 *
 * No money is spent and no provider is called.
 */

import { describe, expect, it } from 'vitest';

import { frameDifference } from './align';
import { compileAnimation } from './compile';
import { quantiseSequence, staticChurn } from './quantise';
import { makeSequence, testCharacter, type SynthFrame } from './testing/synth';

const character = testCharacter();
const SCALE = 3;

function run(frames: SynthFrame[], options: { noise?: number } = {}) {
  const sequence = makeSequence({
    sprite: character,
    palette: character.palette,
    scale: SCALE,
    frames,
    ...(options.noise === undefined ? {} : { noise: options.noise }),
  });
  const compiled = compileAnimation(sequence.plates, {
    palette: character.palette,
    scale: SCALE,
  });
  if (compiled === null) throw new Error('the sequence produced no frames');
  return { sequence, compiled };
}

describe('a jump of a size we chose', () => {
  const RISE = 40; // art pixels
  const frames: SynthFrame[] = Array.from({ length: 30 }, (_, i) => {
    // Flat, then a parabola, then flat again.
    const t = (i - 5) / 19;
    const height = i < 5 || i > 24 ? 0 : Math.sin(Math.PI * t) * RISE;
    return { dy: -Math.round(height * SCALE) };
  });
  const { compiled } = run(frames);

  it('reports the jump height, with a blade hanging below the feet', () => {
    // The blade in the test character is what broke this before D35: taking the
    // lowest pixel as the foot line made a 75 pixel jump measure as 8.
    const heights = compiled.frames.map((frame) => frame.footHeight);
    const travel = Math.max(...heights) - Math.min(...heights);
    expect(travel).toBeGreaterThan(RISE - 1.5);
    expect(travel).toBeLessThan(RISE + 1.5);
  });

  it('finds the frames that are off the ground', () => {
    const airborne = compiled.groundedFromPixels.filter((grounded) => !grounded).length;
    expect(Math.abs(airborne - 20)).toBeLessThanOrEqual(3);
  });

  it('reports no frame as cut off', () => {
    expect(compiled.frames.filter((frame) => frame.silhouette.clipped)).toHaveLength(0);
  });
});

describe('a jump too big for the picture', () => {
  it('catches the cut-off frames — the fault nothing downstream can repair', () => {
    // High enough that the character leaves the top of the picture, which is
    // what a whip crack running past the edge of a video frame looks like.
    const RISE = 300;
    const frames: SynthFrame[] = Array.from({ length: 20 }, (_, i) => ({
      dy: -Math.round(Math.sin((Math.PI * i) / 19) * RISE * SCALE),
    }));
    const { sequence, compiled } = run(frames);
    const found = compiled.frames.filter((frame) => frame.silhouette.clipped).length;
    expect(sequence.clipped).toBeGreaterThan(0);
    expect(Math.abs(found - sequence.clipped)).toBeLessThanOrEqual(1);
  });
});

describe('a cycle of a length we chose', () => {
  it('finds that length', () => {
    const PERIOD = 12;
    const REPEATS = 4;
    const frames: SynthFrame[] = Array.from({ length: PERIOD * REPEATS }, (_, i) => {
      const phase = ((i % PERIOD) / PERIOD) * Math.PI * 2;
      return {
        dy: -Math.round(Math.abs(Math.sin(phase)) * 4 * SCALE),
        dx: Math.round(Math.sin(phase) * 3 * SCALE),
      };
    });
    const { compiled } = run(frames);
    const cells = compiled.frames.map((frame) => frame.cells);

    let best = { period: 0, cost: Infinity };
    for (let period = 4; period <= Math.floor(cells.length / 2); period++) {
      let sum = 0;
      let n = 0;
      for (let i = 0; i + period < cells.length; i++) {
        sum += frameDifference(cells[i]!, cells[i + period]!);
        n++;
      }
      if (sum / n < best.cost) best = { period, cost: sum / n };
    }
    expect(best.period).toBe(PERIOD);
  });
});

describe('a still sprite with noise', () => {
  it('removes the flicker with colour memory', () => {
    const frames: SynthFrame[] = Array.from({ length: 20 }, () => ({ dy: 0 }));
    const { compiled } = run(frames, { noise: 18 });

    const off = quantiseSequence(compiled.grids, character.palette, { memory: false });
    const on = quantiseSequence(compiled.grids, character.palette, { memory: true });
    const churnOff = staticChurn(compiled.grids, off.frames, off.offsets).churn * 100;
    const churnOn = staticChurn(compiled.grids, on.frames, on.offsets).churn * 100;

    expect(churnOn).toBeLessThan(1);
    expect(churnOn).toBeLessThan(churnOff);
  });
});

describe('a relit character', () => {
  it('notices, even though the shape never changed and every colour is legal', () => {
    // Half the frames are the character as drawn; half are the same character
    // 15% darker. A silhouette check sees nothing and every colour still lands
    // on the palette. Only fidelity should notice.
    const frames: SynthFrame[] = Array.from({ length: 16 }, (_, i) => ({
      dy: 0,
      tint: i < 8 ? 1 : 0.85,
    }));
    const { compiled } = run(frames);
    const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;
    const asDrawn = mean(compiled.frames.slice(0, 8).map((frame) => frame.residual));
    const relit = mean(compiled.frames.slice(8).map((frame) => frame.residual));

    expect(relit).toBeGreaterThan(asDrawn * 1.8);
  });
});
