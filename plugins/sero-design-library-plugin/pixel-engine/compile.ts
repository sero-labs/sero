/**
 * Project in, sheet and atlas out (spec §9).
 *
 * The whole compile path is here and it is pure: resolve, pack, render, encode,
 * hash. No model runs in it, nothing reads the clock, nothing draws a random
 * number. Given the same project and the same engine version it produces the
 * same bytes — which is what makes the hash worth recording and a kept sprite
 * worth trusting.
 *
 * Compilation assumes a validated project, exactly as resolution does. Run
 * `validateProject` first; a fault there is a fault about the data, and a throw
 * here is a fault about the caller.
 */

import { buildAtlas, atlasJson, type Atlas, type AtlasRow } from './atlas';
import type { Grid } from './grid';
import { sha256Hex, utf8Bytes } from './hash';
import { packSheet, type PackedSheet } from './pack';
import { encodePng } from './png';
import { renderGrid, type RgbaImage } from './render';
import { resolveFrame } from './resolve';
import { ENGINE_VERSION, findFrame, type PixelProject } from './schema';

/** Frames that belong to no clip are still artwork, and are packed first. */
export const BASE_ROW_NAME = 'base';

/** How long a frame outside any clip is held, in the atlas only. */
const DEFAULT_DURATION_MS = 100;

export interface CompileOptions {
  /** Whole-number pixels per cell. */
  scale?: number;
  /** Transparent cells between packed frames. */
  padding?: number;
  /** Edge cells repeated around each packed frame. */
  extrude?: number;
  /** The sheet's file name, as the atlas should record it. */
  image?: string;
}

export interface CompileResult {
  packed: PackedSheet;
  sheet: RgbaImage;
  png: Uint8Array;
  atlas: Atlas;
  engineVersion: string;
  /** SHA-256 over the sheet bytes and the atlas text — the receipt for this compile. */
  hash: string;
}

export function compileProject(project: PixelProject, options: CompileOptions = {}): CompileResult {
  const scale = options.scale ?? 1;
  const image = options.image ?? 'sheet.png';
  const rows = sheetRows(project);
  // Nothing to draw is not an empty sheet; a 0×0 image is not a PNG at all.
  if (rows.length === 0) throw new Error(`project "${project.id}" has no frames to compile`);

  const packed = packSheet(
    rows.map((row) => ({ name: row.name, frames: row.grids })),
    { padding: options.padding, extrude: options.extrude },
  );
  const sheet = renderGrid(packed.grid, project.palette, { scale });
  const png = encodePng(sheet);
  const atlas = buildAtlas(project, packed, rows.map(toAtlasRow), { image, scale });

  return {
    packed,
    sheet,
    png,
    atlas,
    engineVersion: ENGINE_VERSION,
    hash: sha256Hex(concatBytes(png, utf8Bytes(atlasJson(atlas)))),
  };
}

interface SheetRow extends AtlasRow {
  grids: Grid[];
}

/**
 * One row per clip, and one row first for whatever no clip uses.
 *
 * The base pose usually belongs to no clip, and a sheet that quietly dropped it
 * would be missing the one frame the user approved.
 */
function sheetRows(project: PixelProject): SheetRow[] {
  const inAClip = new Set(project.clips.flatMap((clip) => clip.frames.map((entry) => entry.frameId)));
  const loose = project.frames.filter((frame) => !inAClip.has(frame.id));
  const rows: SheetRow[] = [];

  if (loose.length > 0) {
    rows.push({
      name: BASE_ROW_NAME,
      loop: 'once',
      durations: loose.map(() => DEFAULT_DURATION_MS),
      grids: loose.map((frame) => resolveFrame(project, frame)),
    });
  }

  for (const clip of project.clips) {
    const grids = clip.frames.map((entry) => {
      const frame = findFrame(project, entry.frameId);
      if (frame === undefined) throw new Error(`clip "${clip.id}" names frame "${entry.frameId}", which the project does not have`);
      return resolveFrame(project, frame);
    });
    rows.push({ name: clip.name, loop: clip.loop, durations: clip.frames.map((entry) => entry.durationMs), grids });
  }
  return rows;
}

function toAtlasRow(row: SheetRow): AtlasRow {
  return { name: row.name, loop: row.loop, durations: row.durations };
}

function concatBytes(first: Uint8Array, second: Uint8Array): Uint8Array {
  const out = new Uint8Array(first.length + second.length);
  out.set(first);
  out.set(second, first.length);
  return out;
}
