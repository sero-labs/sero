/**
 * Source pixels onto the art grid.
 *
 * Each cell averages **foreground pixels only**, so the background never bleeds
 * into an edge pixel. No palette decision happens here: the mean colour and the
 * coverage go on to the quantiser, which needs both and needs them unrounded
 * (D26).
 *
 * The scale is fixed for the whole sequence and comes from the character, never
 * from each frame (D12). A model that draws the character bigger must show up as
 * a bigger sprite, because that is the drift being measured.
 */

import type { Foreground, RawGrid, SourceImage } from './types';

export function rawGrid(
  image: SourceImage,
  foreground: Foreground,
  scale: number,
  originX: number,
  originY: number,
  cols: number,
  rows: number,
): RawGrid {
  const colour = new Float64Array(cols * rows * 3);
  const coverage = new Float64Array(cols * rows);

  for (let ry = 0; ry < rows; ry++)
    for (let rx = 0; rx < cols; rx++) {
      const x0 = originX + rx * scale;
      const y0 = originY + ry * scale;
      let r = 0;
      let g = 0;
      let b = 0;
      let drawn = 0;
      let total = 0;
      for (let y = Math.floor(y0); y < Math.floor(y0 + scale); y++)
        for (let x = Math.floor(x0); x < Math.floor(x0 + scale); x++) {
          total++;
          if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
          const at = y * image.width + x;
          if (!foreground[at]) continue;
          r += image.data[at * 4] ?? 0;
          g += image.data[at * 4 + 1] ?? 0;
          b += image.data[at * 4 + 2] ?? 0;
          drawn++;
        }
      const cell = ry * cols + rx;
      coverage[cell] = total > 0 ? drawn / total : 0;
      if (drawn > 0) {
        colour[cell * 3] = r / drawn;
        colour[cell * 3 + 1] = g / drawn;
        colour[cell * 3 + 2] = b / drawn;
      }
    }

  return { cols, rows, colour, coverage };
}
