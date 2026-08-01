/**
 * What the selector would keep, drawn so a person can disagree with it.
 *
 * Between the clip arriving and the sequence being built there is now one
 * screen, and this is what fills it: every sampled moment compiled to the
 * sprite it would become, and the handful of them the selector proposes.
 *
 * Nothing here costs money. Everything it needs is already on disk — the clip
 * is paid for, the samples are staged — so rejecting a take at this point is
 * the cheapest refusal in the whole feature: it saves every repair call and the
 * judge run that would have followed.
 *
 * The previews are the **compiled sprite**, not the video still. A still is not
 * what the sprite will look like, and a user judging a take from 480p video
 * frames would be judging something we are not going to ship.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';

import type { DesignLibraryPaths } from '../../../shared/paths';
import type { CellGrid, SourcePlate } from '../../engine/types';
import type { AnimationRecord, CharacterRecord } from '../../shared/character';
import { sampleFile, samplesDir } from '../../shared/paths';
import { encodeIndexedPng } from '../png';
import { paletteOf } from '../store';
import { compileSequence } from './assemble';

export interface Proposal {
  /** The sample indices the selector chose. */
  proposed: number[];
  /** The cycle the loop search found, when it found one. */
  loopWindow?: { from: number; to: number };
  scale: number;
  canvas: { cols: number; rows: number };
  anchor: { col: number; row: number };
  sampleCount: number;
}

/**
 * Compile every sample, write a preview of each, and say which to keep.
 *
 * The proposal comes out of the same call the build uses, so it cannot drift
 * from what the build would have done on its own.
 */
export async function proposeFrames(
  paths: DesignLibraryPaths,
  character: CharacterRecord,
  animation: AnimationRecord,
  basePose: CellGrid,
  plates: SourcePlate[],
): Promise<Proposal | { failed: string }> {
  const sequence = compileSequence(character, animation, basePose, plates);
  if ('failed' in sequence) return sequence;
  const { built, scale } = sequence;

  const palette = paletteOf(character);
  const directory = samplesDir(paths, character.id, animation.id);
  // A second proposal — a redo, or a clip decoded again — must not leave the
  // first one's previews behind for the strip to read as extra samples.
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });

  for (const [index, frame] of built.compiled.frames.entries()) {
    // Written at one pixel per art pixel, as every stored sprite is. The page
    // scales it up with hard edges; enlarging here would only make it heavier.
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    await writeFile(
      sampleFile(paths, character.id, animation.id, index),
      encodeIndexedPng(frame.cells.cells, frame.cells.cols, frame.cells.rows, palette),
    );
  }

  return {
    proposed: built.kept.map((frame) => frame.index),
    ...(built.loop.cut === undefined
      ? {}
      : { loopWindow: { from: built.loop.cut.start, to: built.loop.cut.end } }),
    scale,
    canvas: built.canvas,
    anchor: built.anchor,
    sampleCount: built.compiled.frames.length,
  };
}

/** Throw the previews away. Called wherever a review stops being open. */
export async function clearSamples(
  paths: DesignLibraryPaths,
  characterId: string,
  animationId: string,
): Promise<void> {
  await rm(samplesDir(paths, characterId, animationId), { recursive: true, force: true });
}
