import { readdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../../../shared/paths';
import type { SourcePlate } from '../../engine/types';
import { makeSequence, testCharacter, walkPose } from '../../engine/testing/synth';
import type { AnimationRecord, CharacterRecord } from '../../shared/character';
import { samplesDir } from '../../shared/paths';
import { decodeIndexedPng } from '../png';
import { compileSequence } from './assemble';
import { clearSamples, proposeFrames } from './propose';

/**
 * The proposal, and the one thing it must never do: drift.
 *
 * The frames offered at the review have to be the frames the build would have
 * picked. If the screen proposed from a second copy of the rule, accepting a
 * proposal unchanged could produce a different animation from the one shown —
 * which is the same fault class as declaring something the other side never
 * acts on, and it is why both come out of one call.
 */

const sprite = testCharacter();
const SCALE = 3;

const CHARACTER: CharacterRecord = {
  id: 'char1',
  name: 'Explorer',
  source: 'reference',
  status: 'approved',
  palette: sprite.palette.map(
    ([r, g, b]) =>
      `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`,
  ),
  cap: { kind: 'measured' },
  ramps: [],
  artHeight: sprite.rows,
  artWidth: sprite.cols,
  exportScale: 4,
  basePoseFile: 'characters/char1/base.png',
  root: { footRow: 38, centreCol: 12 },
  styleNotes: '',
  ingestion: {
    block: 8,
    lift: 8,
    sourceWidth: 0,
    sourceHeight: 0,
    measuredColours: sprite.palette.length,
    residual: 0,
    backgroundRemoved: true,
  },
  createdAt: 0,
  updatedAt: 0,
};

const ANIMATION: AnimationRecord = {
  id: 'anim1',
  characterId: 'char1',
  plan: { name: 'walk', instruction: '', frameCount: 8, playRate: 12, loop: 'forward' },
  status: 'proposing',
  canvas: { cols: 0, rows: 0 },
  anchor: { col: 0, row: 0 },
  frames: [],
  findings: [],
  report: null,
  history: [],
  createdAt: 0,
  updatedAt: 0,
};

const basePose = { cols: sprite.cols, rows: sprite.rows, cells: sprite.cells };

/** The sampled clip, as a walk that really repeats. */
function sampled(count = 30): SourcePlate[] {
  return makeSequence({
    sprite,
    palette: sprite.palette,
    scale: SCALE,
    frames: Array.from({ length: count }, (_, i) => ({ sprite: walkPose((i % 10) / 10) })),
  }).plates;
}

let paths: DesignLibraryPaths;
let home: string;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'sprite-propose-'));
  paths = designLibraryPathsFromHome(home);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('proposing the frames', () => {
  it('offers exactly what the build would have picked on its own', async () => {
    const frames = sampled();
    const proposal = await proposeFrames(paths, CHARACTER, ANIMATION, basePose, frames);
    const built = compileSequence(CHARACTER, ANIMATION, basePose, frames);

    expect('failed' in proposal).toBe(false);
    expect('failed' in built).toBe(false);
    if ('failed' in proposal || 'failed' in built) return;
    expect(proposal.proposed).toEqual(built.built.kept.map((frame) => frame.index));
  });

  it('draws one compiled sprite per sampled moment, not per kept frame', async () => {
    const frames = sampled();
    const proposal = await proposeFrames(paths, CHARACTER, ANIMATION, basePose, frames);
    if ('failed' in proposal) throw new Error(proposal.failed);

    const written = await readdir(samplesDir(paths, 'char1', 'anim1'));
    expect(written.length).toBe(frames.length);
    expect(proposal.sampleCount).toBe(frames.length);
    // The user must be able to pick any moment, not only the proposed ones.
    expect(proposal.proposed.length).toBeLessThan(frames.length);
  });

  it('writes previews as indexed sprites at the canvas size, not video stills', async () => {
    const proposal = await proposeFrames(paths, CHARACTER, ANIMATION, basePose, sampled());
    if ('failed' in proposal) throw new Error(proposal.failed);

    const file = path.join(samplesDir(paths, 'char1', 'anim1'), '000.png');
    const image = decodeIndexedPng(await import('node:fs/promises').then((fs) => fs.readFile(file)));
    expect(image.width).toBe(proposal.canvas.cols);
    expect(image.height).toBe(proposal.canvas.rows);
    expect(image.palette.length).toBeGreaterThan(1);
  });

  it('leaves no previews from an earlier proposal behind', async () => {
    // A second proposal — a redo, or a clip decoded again — that left the first
    // one's previews would have the strip read them as extra samples.
    await proposeFrames(paths, CHARACTER, ANIMATION, basePose, sampled());
    const shorter = sampled(12);
    const proposal = await proposeFrames(paths, CHARACTER, ANIMATION, basePose, shorter);
    if ('failed' in proposal) throw new Error(proposal.failed);

    expect((await readdir(samplesDir(paths, 'char1', 'anim1'))).length).toBe(shorter.length);
  });

  it('says so rather than half-proposing when the clip cannot be read', async () => {
    const proposal = await proposeFrames(paths, CHARACTER, ANIMATION, basePose, []);
    expect('failed' in proposal && proposal.failed).toMatch(/No frames/);
  });

  it('clears the previews when the review is over', async () => {
    await proposeFrames(paths, CHARACTER, ANIMATION, basePose, sampled());
    await clearSamples(paths, 'char1', 'anim1');
    expect(existsSync(samplesDir(paths, 'char1', 'anim1'))).toBe(false);
  });
});
