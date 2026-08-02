/**
 * The picture the author aims at (Ink & Bones plan, Phase 1b).
 *
 * Phase 1 authored blind and the characters were not identifiable: nothing in
 * the loop knew what right looked like. This is the other half — a reference
 * comes in, and everything downstream is measured against it.
 *
 * Two things about it cost real money, so both are bought once and kept:
 *
 *  - **The side view.** The engine draws a character in profile — near/far
 *    limb pairs, toe-east feet, a gait that swings along X — and a reference
 *    is usually a front-facing illustration. One image-to-image call turns it
 *    into the same character seen from the side. The result is written into
 *    the run's own directory and NEVER regenerated for that run: a replayed
 *    request finds the file and spends nothing.
 *  - **A drawn reference**, when the user supplied words instead of a picture.
 *
 * A run whose reference could not be prepared FAILS rather than carrying on.
 * Authoring without the target is the Phase 1 experiment wearing a Phase 1b
 * name, and it would be reported as though it were the new one.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { MediaProvider, MediaSourceAsset } from '../../../runtime/media/contract';
import { executeMedia } from '../../../runtime/media/execute';
import { CHARACTER_MODEL, REPAIR_MODEL } from '../../shared/video-models';
import { toSourceImage } from '../image';
import { attemptFile, attemptProblem } from '../video';
import { encodeIndexedPng } from '../png';
import type { CellGrid, Palette, SourceImage } from '../../engine/types';
import type { ReferenceMaterial } from './reference-image';
import { canonicalise, findFigure, referenceMaterials, renderGrid } from './reference-image';
import { buildPartsSheetPrompt, describeParts, partsSheet, splitParts } from './parts';

/** How much of the canvas height the reference figure is placed at — the same
 * bar the fill gate holds the author to, so target and render are comparable
 * without either being rescaled at judging time. */
export const TARGET_FILL = 0.85;

/** The backdrop both the target and the render are shown on. Matches the
 * review images: a comparison must not be about presentation. */
const BACKDROP = [26, 23, 36] as const;

/** Big enough for a vision model to see a visor slit at 1x. */
const VIEW_SCALE = 4;

/** How many colours the target keeps. Enough for armour, leather, cloth and
 * trim to each hold a ramp; few enough that the author is given a palette
 * rather than a photograph. */
const TARGET_COLOURS = 32;

export interface ReferenceRequest {
  /** A picture the user already has. Any format the provider accepts — it is
   * uploaded, never decoded here. */
  file?: string;
  /** Or words, when there is no picture yet. */
  prompt?: string;
}

export interface PreparedReference {
  /** The reference as supplied or drawn, for showing beside the results. */
  sourcePath: string;
  /** The same character in profile — what the author is actually aiming at. */
  sidePath: string;
  /** The side view matted, cropped and stood on the character's own canvas. */
  targetPath: string;
  /** That target magnified for a vision model. */
  viewPath: string;
  figureW: number;
  figureH: number;
  /** The reference's colours as material ramps, commonest first. */
  materials: ReferenceMaterial[];
  /** The character's pieces, when a parts sheet was bought and came apart. */
  parts: PreparedParts | null;
  /** True when this run paid for something. */
  purchased: boolean;
}

export interface PreparedParts {
  /** The pieces laid out at the target's scale, magnified. */
  sheetPath: string;
  /** '1: 22 x 19 px, 2: …' — the sizes, so the author paints to numbers. */
  sizes: string;
  count: number;
}

export interface ReferenceContext {
  provider: MediaProvider;
  /** Buy a second picture of the character's pieces laid out separately. */
  splitParts?: boolean;
  /** `puppet-lab/<runId>/reference`. */
  directory: string;
  canvasW: number;
  canvasH: number;
  groundRow: number;
  signal: AbortSignal;
  onProgress?(message: string): void;
}

const SOURCE_FILE = 'source';
const SIDE_FILE = 'side.png';
const TARGET_FILE = 'target.png';
const VIEW_FILE = 'target-4x.png';
const SHEET_FILE = 'parts-sheet.png';
const PARTS_FILE = 'parts-4x.png';

/** The instruction that turns a front-facing illustration into a profile of the
 * same character. Deliberately about the VIEW and nothing else: every request
 * to also change something is a request to lose the identity being copied. */
export function buildSideViewPrompt(): string {
  return [
    'Redraw this exact character in a strict side view, facing right, standing at rest.',
    'Same character, same armour, same colours, same proportions, same style, same pixel-art resolution.',
    'Keep every piece of equipment visible and readable from the side: what was held in front of the body is now held out to the side.',
    'Full body from head to feet, standing upright, plain flat background, no shadow, no ground, no text.',
  ].join(' ');
}

async function writeGrid(file: string, grid: CellGrid, palette: Palette): Promise<void> {
  await writeFile(
    file,
    encodeIndexedPng(grid.cells, grid.cols, grid.rows, palette, { transparent: true }),
  );
}

async function writeImage(file: string, img: SourceImage): Promise<void> {
  const palette: [number, number, number][] = [];
  const indexOf = new Map<number, number>();
  const cells = new Int16Array(img.width * img.height);
  for (let p = 0; p < cells.length; p++) {
    const key = (img.data[p * 4] << 16) | (img.data[p * 4 + 1] << 8) | img.data[p * 4 + 2];
    let index = indexOf.get(key);
    if (index === undefined) {
      index = palette.length;
      palette.push([img.data[p * 4], img.data[p * 4 + 1], img.data[p * 4 + 2]]);
      indexOf.set(key, index);
    }
    cells[p] = index;
  }
  await writeFile(file, encodeIndexedPng(cells, img.width, img.height, palette, { transparent: false }));
}

/** A file that is already there is a purchase already made. */
async function existing(file: string): Promise<Buffer | null> {
  return readFile(file).catch(() => null);
}

async function drawFromWords(prompt: string, context: ReferenceContext): Promise<string> {
  context.onProgress?.('Drawing the reference…');
  const attempt = await executeMedia(
    context.provider,
    { capability: 'text-to-image', model: CHARACTER_MODEL, prompt },
    {
      directory: context.directory,
      signal: context.signal,
      readAsset: async () => {
        throw new Error('Drawing a reference from words uses no source picture.');
      },
      ...(context.onProgress === undefined ? {} : { onProgress: context.onProgress }),
    },
  );
  const problem = attemptProblem(attempt);
  if (problem !== null) throw new Error(`The reference could not be drawn: ${problem}`);
  const file = attemptFile(attempt, context.directory);
  if (file === null) throw new Error('The reference model returned no picture.');
  return file;
}

/** One image-to-image call against the user's own picture, saved nowhere but
 * the caller's chosen file. Shared by both edits so they cannot drift apart in
 * how the source is uploaded or how a failure is reported. */
async function editReference(
  source: string,
  prompt: string,
  context: ReferenceContext,
  whatFailed: string,
): Promise<Buffer> {
  const bytes = await readFile(source);
  const asset: MediaSourceAsset = {
    path: path.basename(source),
    bytes,
    // Whatever the user handed over — a JPEG reference is uploaded as a JPEG
    // and never decoded on this side. What comes back is PNG because the
    // request asks for it.
    mediaType: source.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
  };
  const attempt = await executeMedia(
    context.provider,
    {
      capability: 'image-to-image',
      model: REPAIR_MODEL,
      prompt,
      sourceAssetIds: ['reference'],
      extra: { output_format: 'png' },
    },
    {
      directory: context.directory,
      signal: context.signal,
      readAsset: async (id) => {
        if (id !== 'reference') throw new Error(`No source asset named ${id}.`);
        return asset;
      },
      ...(context.onProgress === undefined ? {} : { onProgress: context.onProgress }),
    },
  );
  const problem = attemptProblem(attempt);
  if (problem !== null) throw new Error(`${whatFailed}: ${problem}`);
  const file = attemptFile(attempt, context.directory);
  if (file === null) throw new Error(`${whatFailed}: the model returned no picture.`);
  return readFile(file);
}

async function drawSideView(source: string, context: ReferenceContext): Promise<Buffer> {
  context.onProgress?.('Turning the reference side-on…');
  return editReference(source, buildSideViewPrompt(), context, 'The side view could not be drawn');
}

async function drawPartsSheet(source: string, context: ReferenceContext): Promise<Buffer> {
  context.onProgress?.('Drawing the character in pieces…');
  return editReference(source, buildPartsSheetPrompt(), context, 'The parts sheet could not be drawn');
}

/** Split a sheet and write the picture the author is shown, or report nothing
 * rather than a sheet with one blob on it. */
async function splitAndWrite(
  sheet: Buffer,
  reduction: number,
  file: string,
  context: ReferenceContext,
): Promise<PreparedParts | null> {
  const parts = splitParts(toSourceImage(sheet), { reduction, colours: TARGET_COLOURS });
  // One piece means the model drew the assembled character again; two is not a
  // character taken apart either. Below three there is nothing here the whole
  // figure did not already say.
  if (parts.length < 3) return null;
  await writeImage(file, partsSheet(parts, VIEW_SCALE, BACKDROP));
  return { sheetPath: file, sizes: describeParts(parts), count: parts.length };
}

/**
 * Prepare a run's reference, buying at most one picture and only once.
 *
 * The order matters: everything already on disk is reused before anything is
 * requested, so a replayed request, a resumed run or a second attempt after a
 * crash all cost nothing.
 */
export async function prepareReference(
  request: ReferenceRequest,
  context: ReferenceContext,
): Promise<PreparedReference> {
  await mkdir(context.directory, { recursive: true });
  const sidePath = path.join(context.directory, SIDE_FILE);
  const sheetPath = path.join(context.directory, SHEET_FILE);
  const partsPath = path.join(context.directory, PARTS_FILE);
  const targetPath = path.join(context.directory, TARGET_FILE);
  const viewPath = path.join(context.directory, VIEW_FILE);
  let purchased = false;

  let sourcePath = request.file ?? '';
  if (sourcePath === '') {
    const drawn = path.join(context.directory, `${SOURCE_FILE}.png`);
    const kept = await existing(drawn);
    if (kept === null) {
      if (request.prompt === undefined || request.prompt.trim() === '') {
        throw new Error('A reference run needs either a picture or words to draw one from.');
      }
      const file = await drawFromWords(request.prompt, context);
      await writeFile(drawn, await readFile(file));
      purchased = true;
    }
    sourcePath = drawn;
  }

  let side = await existing(sidePath);
  if (side === null) {
    side = await drawSideView(sourcePath, context);
    await writeFile(sidePath, side);
    purchased = true;
  }

  const image = toSourceImage(side);
  const figure = findFigure(image);
  if (figure === null) {
    throw new Error('No figure could be separated from the side view — the background swallowed it.');
  }
  const target = canonicalise(image, figure, {
    canvasW: context.canvasW,
    canvasH: context.canvasH,
    groundRow: context.groundRow,
    fill: TARGET_FILL,
    colours: TARGET_COLOURS,
  });
  if (target === null) {
    throw new Error('The side view reduced to nothing on the character canvas.');
  }
  await writeGrid(targetPath, target.grid, target.palette);
  await writeImage(viewPath, renderGrid(target.grid, target.palette, VIEW_SCALE, BACKDROP));

  // The parts sheet is optional on purpose: it is a second paid picture, and a
  // run that cannot get one is worse off but not broken — it still has the
  // whole figure to aim at. So a failure here is recorded and stepped over,
  // where a failure to prepare the TARGET stops the run.
  let parts: PreparedParts | null = null;
  if (context.splitParts === true) {
    const sheet = await existing(sheetPath).then(
      async (kept) => {
        if (kept !== null) return kept;
        const drawn = await drawPartsSheet(sourcePath, context);
        await writeFile(sheetPath, drawn);
        purchased = true;
        return drawn;
      },
      () => null,
    );
    parts = sheet === null ? null : await splitAndWrite(sheet, target.reduction, partsPath, context);
  }

  return {
    sourcePath,
    sidePath,
    targetPath,
    viewPath,
    figureW: target.figureW,
    figureH: target.figureH,
    materials: referenceMaterials(target),
    parts,
    purchased,
  };
}
