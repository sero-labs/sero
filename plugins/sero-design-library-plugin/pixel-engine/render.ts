/**
 * Index grid plus palette to RGBA (spec §9).
 *
 * Nearest neighbour at whole-number scale, and nothing else: no blending, no
 * anti-aliasing, no filtering at any point. A fractional scale is refused rather
 * than rounded, because a resample that duplicates some rows and drops others
 * puts a seam across a character's hips and a grey column between its legs (P6) —
 * and the caller who asked for 1.5× would never see why.
 */

import { cellAt, TRANSPARENT_INDEX, type Grid } from './grid';
import { resolveFrame } from './resolve';
import type { Frame, Palette, PixelProject } from './schema';

export interface RgbaImage {
  width: number;
  height: number;
  /** Four bytes per pixel, row by row from the top left. */
  data: Uint8Array;
}

export interface RenderOptions {
  /** A whole number of screen pixels per cell. Anything else is refused. */
  scale?: number;
}

export function renderGrid(grid: Grid, palette: Palette, options: RenderOptions = {}): RgbaImage {
  const scale = options.scale ?? 1;
  if (!Number.isInteger(scale) || scale < 1) {
    throw new Error(`scale ${scale} is not a whole number of pixels; a grid is never stretched`);
  }

  const cellsWide = grid[0]?.length ?? 0;
  const cellsHigh = grid.length;
  const width = cellsWide * scale;
  const height = cellsHigh * scale;
  const colours = paletteBytes(palette);
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = cellAt(grid, Math.floor(x / scale), Math.floor(y / scale));
      const colour = colours[index] ?? colours[TRANSPARENT_INDEX];
      const at = (y * width + x) * 4;
      data[at] = colour[0];
      data[at + 1] = colour[1];
      data[at + 2] = colour[2];
      data[at + 3] = colour[3];
    }
  }
  return { width, height, data };
}

export function renderFrame(project: PixelProject, frame: Frame, options: RenderOptions = {}): RgbaImage {
  return renderGrid(resolveFrame(project, frame), project.palette, options);
}

export type Rgba = [number, number, number, number];

/**
 * The palette as bytes.
 *
 * Index 0 is fully transparent whatever colour it carries, because index 0 means
 * transparent and nothing else (spec §5) — a project cannot smuggle a second
 * transparency in through an alpha channel.
 */
export function paletteBytes(palette: Palette): Rgba[] {
  return palette.colours.map((colour, index) => (index === TRANSPARENT_INDEX ? [0, 0, 0, 0] : parseHex(colour.hex)));
}

export function parseHex(hex: string): Rgba {
  const digits = hex.startsWith('#') ? hex.slice(1) : hex;
  const value = Number.parseInt(digits, 16);
  if (digits.length !== 6 || Number.isNaN(value)) throw new Error(`"${hex}" is not a colour; write one as #rrggbb`);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff, 0xff];
}
