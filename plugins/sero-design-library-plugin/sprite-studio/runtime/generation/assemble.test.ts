/**
 * The firewall, on material whose answer is known.
 *
 * These are the checks that decide whether what came back from a video model is
 * usable, so they are tested the same way the engine is: with plates built here,
 * moving the way we chose. No provider is called and no money is spent.
 */

import { describe, expect, it } from 'vitest';

import { makeSequence, testCharacter, walkPose, type SynthFrame } from '../../engine/testing/synth';
import { buildPlate, framePlate, scaleForFrame } from '../plate';
import { decodeIndexedPng } from '../png';
import { assemble, calibrateScale } from './assemble';

const character = testCharacter();
const SCALE = 3;

function plates(frames: SynthFrame[], noise = 0) {
  return makeSequence({
    sprite: character,
    palette: character.palette,
    scale: SCALE,
    frames,
    noise,
  }).plates;
}

const standing = Array.from({ length: 24 }, () => ({ dy: 0 }));

describe('the plate handed to the model', () => {
  const basePose = { cols: character.cols, rows: character.rows, cells: character.cells };

  it('leaves room for a reach, and more of it when the feet leave the ground', () => {
    const standingPlate = buildPlate(basePose, character.palette, { footRow: 38, centreCol: 12 });
    const jumpingPlate = buildPlate(basePose, character.palette, {
      airborne: true,
      footRow: 38,
      centreCol: 12,
    });

    // A whip crack or a jump that runs off the edge arrives already cut, and
    // nothing downstream can put it back (D19).
    expect(standingPlate.scale * character.rows).toBeLessThan(standingPlate.height * 0.7);
    expect(jumpingPlate.scale).toBeLessThan(standingPlate.scale);
    expect(jumpingPlate.footY).toBeGreaterThan(jumpingPlate.height * 0.8);
  });

  it('is opaque, because a transparent plate is composited by the model', () => {
    const plate = buildPlate(basePose, character.palette, { footRow: 38, centreCol: 12 });
    // Our own reader accepts it, and the background is a real magenta pixel
    // rather than a transparency the model would fill with anything it liked.
    const decoded = decodeIndexedPng(plate.bytes);
    expect(decoded.width).toBe(plate.width);
    expect(plate.bytes.includes(Buffer.from('tRNS', 'ascii'))).toBe(false);
  });

  it('enlarges a frame for a model to look at without blurring it', () => {
    const frame = { cols: 4, rows: 3, cells: Int16Array.from([0, 1, -1, 2, 0, 1, -1, 2, 0, 1, -1, 2]) };
    const big = framePlate(frame, character.palette, { scale: 8, transparent: true });
    const decoded = decodeIndexedPng(big.bytes);
    expect(decoded.width).toBe(32);
    expect(decoded.cells[0]).toBe(0);
    expect(decoded.cells[7]).toBe(0);
    expect(decoded.cells[8]).toBe(1);
  });

  it('carries the plate scale across to whatever size the clip comes back at', () => {
    const plate = buildPlate(basePose, character.palette, { footRow: 38, centreCol: 12 });
    expect(scaleForFrame(plate, plate.width)).toBeCloseTo(plate.scale);
    expect(scaleForFrame(plate, plate.width / 2)).toBeCloseTo(plate.scale / 2);
  });
});

describe('calibrating the scale', () => {
  it('keeps the plate geometry when it agrees with the character', () => {
    const { scale, source } = calibrateScale(plates(standing), {
      palette: character.palette,
      expected: SCALE,
      artHeight: character.rows,
    });
    expect(source).toBe('plate');
    expect(scale).toBe(SCALE);
  });

  it('measures instead when the model drew the character at another size', () => {
    // The geometry says 6 and the pictures say 3. A scale wrong by a factor of
    // two makes every size check meaningless and produces a sprite half the
    // size it should be, with nothing to explain it.
    const { scale, source } = calibrateScale(plates(standing), {
      palette: character.palette,
      expected: SCALE * 2,
      artHeight: character.rows,
    });
    expect(source).toBe('measured');
    expect(scale).toBeGreaterThan(SCALE * 0.8);
    expect(scale).toBeLessThan(SCALE * 1.2);
  });
});

describe('assembling a sequence', () => {
  it('thins to the frames asked for and keeps the real timing', () => {
    const built = assemble(plates(standing), {
      palette: character.palette,
      scale: SCALE,
      artHeight: character.rows,
      loop: 'once',
    });

    expect(built).not.toBeNull();
    expect(built!.kept.length).toBeLessThanOrEqual(8);
    // Every millisecond of the clip is still accounted for, so the animation
    // plays at the speed it was drawn at rather than at a rate chosen after.
    const total = built!.kept.reduce((sum, frame) => sum + frame.durationMs, 0);
    expect(total).toBeGreaterThanOrEqual(24 * 83 - 24);
  });

  it('cuts a walk at the cycle it really repeats on', () => {
    const built = assemble(
      plates(Array.from({ length: 40 }, (_, i) => ({ sprite: walkPose((i % 10) / 10) }))),
      {
        palette: character.palette,
        scale: SCALE,
        artHeight: character.rows,
        loop: 'forward',
      },
    );

    expect(built!.loop.mode).toBe('forward');
    expect(built!.loop.cut).toBeDefined();
    expect(built!.report.loopClosure).toBeLessThan(0.12);
    expect(built!.loop.advice).toBe('');
  });

  it('refuses to call an unloopable walk a loop, and says what the answers are', () => {
    // Three walks in five are like this: no pose is ever held twice, so no
    // amount of cutting produces a cycle (D34, §11.1).
    const built = assemble(
      plates(Array.from({ length: 16 }, (_, i) => ({ sprite: testCharacter({ crouch: i }) }))),
      {
        palette: character.palette,
        scale: SCALE,
        artHeight: character.rows,
        loop: 'forward',
      },
    );

    expect(built!.loop.mode).toBe('once');
    expect(built!.loop.advice).toMatch(/ping-pong it/);
    // And it does not quietly ship a walk that jerks every cycle.
    expect(built!.report.loopClosure).toBeNull();
  });

  it('reports the arc rather than flattening it, and the frames it kept', () => {
    const jump = plates(
      Array.from({ length: 30 }, (_, i) => {
        const t = (i - 5) / 19;
        return { dy: i < 5 || i > 24 ? 0 : -Math.round(Math.sin(Math.PI * t) * 40 * SCALE) };
      }),
    );
    const built = assemble(jump, {
      palette: character.palette,
      scale: SCALE,
      artHeight: character.rows,
      loop: 'once',
    });

    expect(built!.report.footTravel).toBeGreaterThan(30);
    expect(built!.report.sampledFrames).toBe(30);
    expect(built!.report.keptFrames).toBe(built!.kept.length);
    expect(built!.report.churn).toBeLessThanOrEqual(built!.report.churnWithoutMemory);
  });

  it('refuses a sequence whose character is the wrong size', () => {
    // The knight arrived inside a drawn white box measuring 205 art pixels
    // against his real 129, and the size check is what rejects those frames
    // rather than merely reporting a number (D37).
    const built = assemble(plates(standing), {
      palette: character.palette,
      scale: SCALE,
      artHeight: character.rows * 2,
      loop: 'once',
    });

    const refused = built!.findings.filter((finding) => finding.level === 'refuse');
    expect(refused.some((finding) => finding.check === 'body-size')).toBe(true);
  });

  it('uses the frames the user chose, and nothing else from the clip', () => {
    const jump = plates(
      Array.from({ length: 30 }, (_, i) => {
        const t = (i - 5) / 19;
        return { dy: i < 5 || i > 24 ? 0 : -Math.round(Math.sin(Math.PI * t) * 40 * SCALE) };
      }),
    );
    const built = assemble(jump, {
      palette: character.palette,
      scale: SCALE,
      artHeight: character.rows,
      loop: 'once',
      // Deliberately not what the selector would have picked, and handed over
      // in the order they were clicked in.
      chosen: [20, 0, 9, 4],
    });

    expect(built!.kept.map((frame) => frame.index)).toEqual([0, 4, 9, 20]);
    // Every millisecond of the source up to the last chosen frame is still
    // accounted for: dropping a frame lengthens the one before it (D23).
    expect(built!.kept[0]!.durationMs).toBe(
      jump.slice(0, 4).reduce((sum, plate) => sum + plate.durationMs, 0),
    );
    expect(built!.report.keptFrames).toBe(4);
  });

  it('does not re-cut a loop underneath a hand-picked set', () => {
    // The user chose from a strip of the whole clip. Cutting the cycle over the
    // top of that would drop frames they had just picked.
    const walk = plates(Array.from({ length: 40 }, (_, i) => ({ sprite: walkPose((i % 10) / 10) })));
    const built = assemble(walk, {
      palette: character.palette,
      scale: SCALE,
      artHeight: character.rows,
      loop: 'forward',
      chosen: [0, 12, 33],
    });

    expect(built!.kept.map((frame) => frame.index)).toEqual([0, 12, 33]);
  });

  it('refuses a jump whose airborne frames never leave the ground', () => {
    const built = assemble(plates(standing), {
      palette: character.palette,
      scale: SCALE,
      artHeight: character.rows,
      loop: 'once',
      declaredGrounded: standing.map((_, i) => i < 4),
    });

    expect(
      built!.findings.some((finding) => finding.check === 'root' && finding.level === 'refuse'),
    ).toBe(true);
  });
});
