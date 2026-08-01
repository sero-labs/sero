/**
 * Turning a picture into a character (spec §2.1, D8).
 *
 * Recover the true artwork, extract the palette, cut the background, set the
 * root — before anything else happens, because everything downstream is
 * measured against what comes out of here.
 *
 * Three things are load-bearing and none of them is obvious:
 *
 *  - **The picture is kept.** A cap and a re-measure both start again from the
 *    stored original rather than from the sprite as it currently stands, so
 *    capping to 8 and then back to 32 recovers the wider palette instead of
 *    compounding the loss. It also means a re-measure needs no re-upload.
 *  - **The base pose is written indexed** (D2). Never RGBA: RGBA can hold a
 *    colour the palette does not have, which is the one thing this pipeline
 *    exists to prevent.
 *  - **A change to the sheet returns the character to the checkpoint.** A cap or
 *    a re-measure changes the pixels the user approved, and nothing may be
 *    generated from measurements nobody has ruled on (D5).
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { DesignLibraryPaths } from '../../shared/paths';
import { relativeToHome } from '../../shared/paths';
import { recoverArtwork } from '../engine/art-grid';
import { buildRamps, fromHex, oklab } from '../engine/colour';
import { measureSilhouette } from '../engine/measure';
import { capPalette, capResidual, dedupePalette, remapCells } from '../engine/palette';
import type { Foreground, Palette, Ramp, Rgb, SourceImage } from '../engine/types';
import type {
  CharacterRecord,
  CharacterRoot,
  CharacterSource,
  IngestionReport,
  PaletteCap,
} from '../shared/character';
import { basePoseFile, characterSourceFile } from '../shared/paths';
import { cellsToImage, toSourceImage } from './image';
import { MAX_PALETTE, encodeIndexedPng } from './png';
import { paletteToHexes, readCharacter, writeCharacter } from './store';

/** The kept original. A fixed name, because the one the page sends is untrusted. */
const SOURCE_NAME = 'original.png';

export interface IngestRequest {
  characterId: string;
  name: string;
  source: CharacterSource;
  /** The picture itself. A PNG; the page converts anything else on the way in. */
  bytes: Buffer;
  /** What the user called it, used only to say which file was wrong. */
  fileName: string;
}

/** What the measurement found, before any cap has been chosen. */
interface Measurement {
  cols: number;
  rows: number;
  cells: Int16Array;
  palette: Rgb[];
  block: number;
  lift: number;
  /** False when the grid was recovered from softened edges rather than read. */
  sharp: boolean;
  sourceWidth: number;
  sourceHeight: number;
  backgroundRemoved: boolean;
  enclosed: { regions: number; pixels: number };
}

interface Settled {
  palette: Rgb[];
  root: CharacterRoot;
  /** The base pose, relative to the app state directory. */
  file: string;
  ingestion: IngestionReport;
}

/**
 * Everything we draw is on flat magenta, so keying it is a per-pixel test. A
 * picture the user supplied is on whatever they had, so it is flood filled
 * inwards from the border and the whites of the eyes survive (D7).
 */
function backgroundFor(source: CharacterSource): 'magenta' | 'flood' {
  return source === 'text' ? 'magenta' : 'flood';
}

function measurePicture(
  image: SourceImage,
  source: CharacterSource,
  fillEnclosed = false,
): Measurement {
  const recovered = recoverArtwork(image, { background: backgroundFor(source), fillEnclosed });
  if (recovered === null) {
    throw new Error('No character was found in that picture: all of it read as background.');
  }

  const palette = dedupePalette(recovered.palette);
  // Dropping a duplicate entry shifts every index after it, so the cells are
  // re-pointed rather than left addressing the palette they were measured
  // against — two indexes must never be one colour, and neither may a cell end
  // up on a colour it was not drawn in.
  const cells =
    palette.length === recovered.palette.length
      ? recovered.cells
      : remapCells(recovered.cells, recovered.palette, palette);

  return {
    cols: recovered.cols,
    rows: recovered.rows,
    cells,
    palette,
    block: recovered.grid.block,
    lift: recovered.grid.lift,
    sharp: recovered.grid.sharp,
    sourceWidth: image.width,
    sourceHeight: image.height,
    enclosed: recovered.enclosed,
    // Measured rather than assumed: part of the picture was not the character,
    // either because it lay outside the recovered box or because it left a hole
    // inside one.
    backgroundRemoved:
      recovered.cols * recovered.grid.block < image.width ||
      recovered.rows * recovered.grid.block < image.height ||
      cells.some((index) => index < 0),
  };
}

/** The palette the user asked for, before the file's own limit is applied. */
function chosenPalette(measurement: Measurement, cap: PaletteCap): Rgb[] {
  if (cap.kind === 'fixed') {
    const hexes = cap.palette ?? [];
    if (hexes.length === 0) throw new Error('A fixed palette needs at least one colour.');
    return hexes.map((hex) => {
      const rgb = fromHex(hex);
      if (rgb === null) throw new Error(`${hex} is not a colour this can read.`);
      return rgb;
    });
  }
  if (cap.kind === 'count') {
    const count = cap.count ?? 0;
    if (!Number.isInteger(count) || count < 1) {
      throw new Error('A palette cap has to be a whole number of colours, one or more.');
    }
    return capPalette(measurement.cells, measurement.palette, count);
  }
  return [...measurement.palette];
}

/**
 * A file holds 255 colours, because index 0 is the transparent slot (D2).
 *
 * A palette past that is reduced rather than refused, and the report keeps the
 * measured count so the reduction is visible instead of silent.
 */
function withinOneFile(measurement: Measurement, wanted: Rgb[]): Rgb[] {
  if (wanted.length <= MAX_PALETTE) return wanted;
  const usage = remapCells(measurement.cells, measurement.palette, wanted);
  return dedupePalette(capPalette(usage, wanted, MAX_PALETTE));
}

/** The root: the foot line and the horizontal centre of the lowest band (D35). */
function rootOf(measurement: Measurement, cells: Int16Array, palette: Palette): CharacterRoot {
  const foreground: Foreground = new Uint8Array(cells.length);
  for (const [i, index] of cells.entries()) foreground[i] = index < 0 ? 0 : 1;
  const pose = cellsToImage({ cols: measurement.cols, rows: measurement.rows, cells }, palette);
  const silhouette = measureSilhouette(pose, foreground);
  if (silhouette === null) throw new Error('The recovered sprite has nothing drawn in it.');
  // Only the foot line and the centre are taken. The rest of a silhouette
  // describes a drawn plate, and this grid is already cropped to the character.
  return { footRow: silhouette.footY, centreCol: Math.round(silhouette.footX) };
}

/**
 * Put the sprite on the palette the cap asks for, write the base pose and
 * describe what it cost.
 *
 * Ingestion, a cap and a re-measure all come through here, so the three can
 * never drift apart.
 */
async function settle(
  paths: DesignLibraryPaths,
  characterId: string,
  measurement: Measurement,
  cap: PaletteCap,
): Promise<Settled> {
  const palette = withinOneFile(measurement, dedupePalette(chosenPalette(measurement, cap)));
  const cells = remapCells(measurement.cells, measurement.palette, palette);
  const residual = capResidual(measurement.cells, measurement.palette, palette);

  const file = basePoseFile(paths, characterId);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, encodeIndexedPng(cells, measurement.cols, measurement.rows, palette));

  return {
    palette,
    root: rootOf(measurement, cells, palette),
    file: relativeToHome(paths, file),
    ingestion: {
      block: measurement.block,
      lift: measurement.lift,
      sharp: measurement.sharp,
      sourceWidth: measurement.sourceWidth,
      sourceHeight: measurement.sourceHeight,
      measuredColours: measurement.palette.length,
      residual: Math.round(residual * 1000),
      backgroundRemoved: measurement.backgroundRemoved,
      enclosedRegions: measurement.enclosed.regions,
      // Reported in the units the user is looking at, not in file pixels.
      enclosedArtPixels: Math.round(
        measurement.enclosed.pixels / Math.max(1, measurement.block * measurement.block),
      ),
    },
  };
}

/**
 * A picture becomes a character sheet nobody has approved yet.
 *
 * Nothing is generated from it until the user rules on what they can see (D5),
 * which is why this writes a record and stops.
 */
export async function ingestCharacter(
  paths: DesignLibraryPaths,
  request: IngestRequest,
): Promise<CharacterRecord> {
  const image = toSourceImage(request.bytes, request.fileName);
  const measurement = measurePicture(image, request.source);

  const original = characterSourceFile(paths, request.characterId, SOURCE_NAME);
  await mkdir(path.dirname(original), { recursive: true });
  await writeFile(original, request.bytes);

  const cap: PaletteCap = { kind: 'measured' };
  const settled = await settle(paths, request.characterId, measurement, cap);
  const now = Date.now();
  const record: CharacterRecord = {
    id: request.characterId,
    name: request.name,
    source: request.source,
    sourceFile: relativeToHome(paths, original),
    status: 'draft',
    palette: paletteToHexes(settled.palette),
    cap,
    ramps: defaultRamps(settled.palette),
    artHeight: measurement.rows,
    artWidth: measurement.cols,
    // The scale the artwork was drawn at, so an export gives back a picture the
    // size of the one that came in. Whole numbers only, or the pixels blur (D3).
    exportScale: Math.max(1, measurement.block),
    basePoseFile: settled.file,
    root: settled.root,
    styleNotes: '',
    ingestion: settled.ingestion,
    createdAt: now,
    updatedAt: now,
  };

  await writeCharacter(paths, record);
  return record;
}

/** Measure the kept picture again, from scratch. */
async function rebuild(
  paths: DesignLibraryPaths,
  character: CharacterRecord,
  cap: PaletteCap,
): Promise<CharacterRecord> {
  if (character.sourceFile === undefined) {
    throw new Error(`${character.name} was not made from a picture, so there is nothing to measure.`);
  }
  const bytes = await readFile(path.join(paths.home, character.sourceFile));
  const measurement = measurePicture(
    toSourceImage(bytes),
    character.source,
    character.fillEnclosed === true,
  );
  const settled = await settle(paths, character.id, measurement, cap);

  const next: CharacterRecord = {
    ...character,
    // The sheet the user approved no longer describes the character, so the
    // checkpoint has to be answered again before anything else is generated.
    status: 'draft',
    palette: paletteToHexes(settled.palette),
    cap,
    // The palette changed, so ramps built on the old indexes would point at
    // colours that no longer exist. Names the AI wrote are lost with them,
    // which is the honest cost of changing the colour set.
    ramps: defaultRamps(settled.palette),
    artHeight: measurement.rows,
    artWidth: measurement.cols,
    basePoseFile: settled.file,
    root: settled.root,
    ingestion: settled.ingestion,
    updatedAt: Date.now(),
  };
  await writeCharacter(paths, next);
  return next;
}

/**
 * Cap the palette and re-quantise, so the result is visible before the
 * character is approved and before anything is generated from it (D17).
 *
 * Missing character: a no-op rather than an error, because intent is submitted
 * asynchronously and the world may have moved on.
 */
export async function applyPaletteCap(
  paths: DesignLibraryPaths,
  characterId: string,
  cap: PaletteCap,
): Promise<CharacterRecord | null> {
  const character = await readCharacter(paths, characterId);
  if (character === null) return null;
  return rebuild(paths, character, cap);
}

/**
 * Take the enclosed background out, or put it back.
 *
 * Both directions re-measure from the kept original, so this is a choice the
 * user can change their mind about rather than an edit that loses the pockets
 * for good.
 */
export async function fillEnclosed(
  paths: DesignLibraryPaths,
  characterId: string,
  fill: boolean,
): Promise<CharacterRecord | null> {
  const character = await readCharacter(paths, characterId);
  if (character === null) return null;
  return rebuild(paths, { ...character, fillEnclosed: fill }, character.cap);
}

/** Measure the character again from its kept picture, keeping what the user set. */
export async function remeasure(
  paths: DesignLibraryPaths,
  characterId: string,
): Promise<CharacterRecord | null> {
  const character = await readCharacter(paths, characterId);
  if (character === null) return null;
  return rebuild(paths, character, character.cap);
}

/**
 * Plain names for the hue bands, in OKLab hue order.
 *
 * Ordinary words, because they are what a person would say pointing at the
 * palette. The AI renames them from the reference once it has seen the
 * character; this is what makes the fidelity check work from the moment a
 * character exists rather than from the moment the AI gets round to it (D27).
 */
const HUE_BANDS: readonly { readonly below: number; readonly name: string }[] = [
  { below: 45, name: 'reds' },
  { below: 75, name: 'oranges' },
  { below: 130, name: 'yellows' },
  { below: 175, name: 'greens' },
  { below: 235, name: 'teals' },
  { below: 290, name: 'blues' },
  { below: 325, name: 'purples' },
  { below: 345, name: 'pinks' },
  { below: 360, name: 'reds' },
];

/** Below this, a ramp of oranges is a ramp of browns. */
const BROWN_LIGHTNESS = 0.65;

function nameFor(ramp: Ramp, palette: Palette): string {
  if (ramp.neutral) return 'neutrals';
  const labs = ramp.indexes.map((index) => palette[index]).flatMap((rgb) => (rgb ? [oklab(rgb)] : []));
  if (labs.length === 0) return 'neutrals';
  // Summing the two chroma axes is a chroma-weighted mean direction, which is
  // how `buildRamps` holds a ramp's hue as well.
  const a = labs.reduce((sum, lab) => sum + lab[1], 0);
  const b = labs.reduce((sum, lab) => sum + lab[2], 0);
  const lightness = labs.reduce((sum, lab) => sum + lab[0], 0) / labs.length;
  const degrees = (((Math.atan2(b, a) * 180) / Math.PI) + 360) % 360;
  const band = HUE_BANDS.find((entry) => degrees < entry.below)?.name ?? 'reds';
  // Brown has no hue of its own: it is a dark orange, and leather, wood and
  // dirt are most of what a character is made of.
  return band === 'oranges' && lightness < BROWN_LIGHTNESS ? 'browns' : band;
}

/** The palette grouped into named material ramps, before the AI has seen it. */
export function defaultRamps(palette: Palette): { name: string; indexes: number[] }[] {
  const used = new Map<string, number>();
  return buildRamps(palette).map((ramp) => {
    const name = nameFor(ramp, palette);
    const seen = used.get(name) ?? 0;
    used.set(name, seen + 1);
    // Two ramps of the same colour family are two materials, so they need
    // telling apart even before anyone has said what they are.
    return { name: seen === 0 ? name : `${name} ${seen + 1}`, indexes: [...ramp.indexes] };
  });
}
