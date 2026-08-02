/**
 * The reference path meets pictures nobody in this repo drew. Each test here is
 * a shape a real reference actually had, because the failure mode is not a
 * crash but a plausible-looking target that quietly cropped the head off.
 *
 * The separation, the palette reduction and the ramp grouping all belong to the
 * studio's own engine and are tested there; what is proved here is the one
 * decision this file makes — where on the character's canvas the figure lands.
 */
import { describe, expect, it } from 'vitest';
import { TRANSPARENT, type SourceImage } from '../../engine/types';
import { canonicalise, findFigure, referenceMaterials, renderGrid } from './reference-image';

function blank(width: number, height: number, fill: readonly number[] = [0, 0, 0, 0]): SourceImage {
  const data = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    data[p * 4] = fill[0];
    data[p * 4 + 1] = fill[1];
    data[p * 4 + 2] = fill[2];
    data[p * 4 + 3] = fill[3];
  }
  return { width, height, data };
}

function box(
  img: SourceImage,
  b: { x0: number; y0: number; x1: number; y1: number },
  c: readonly number[],
): void {
  for (let y = b.y0; y <= b.y1; y++) {
    for (let x = b.x0; x <= b.x1; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  }
}

const STEEL = [90, 110, 140];
const GOLD = [200, 150, 60];
const CANVAS = { canvasW: 112, canvasH: 144, groundRow: 138, fill: 0.85, colours: 48 };

/** A figure on a checkerboard, the shape Dan's reference actually is: a
 * transparent PNG flattened into a JPEG, so the checker is real pixels. */
function onCheckerboard(width = 120, height = 200): SourceImage {
  const img = blank(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      box(img, { x0: x, y0: y, x1: x, y1: y }, (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0 ? [245, 245, 245] : [220, 220, 220]);
    }
  }
  box(img, { x0: 40, y0: 20, x1: 79, y1: 179 }, STEEL);
  box(img, { x0: 40, y0: 20, x1: 79, y1: 59 }, GOLD);
  return img;
}

describe('findFigure', () => {
  it('separates the figure from a two-tone checkerboard backdrop', () => {
    const figure = findFigure(onCheckerboard());
    if (figure === null) throw new Error('no figure');
    expect(figure.bounds).toEqual({ x0: 40, y0: 20, x1: 79, y1: 179 });
  });

  it('uses transparency when the picture carries it', () => {
    const img = blank(40, 60);
    box(img, { x0: 10, y0: 5, x1: 29, y1: 54 }, GOLD);
    const figure = findFigure(img);
    if (figure === null) throw new Error('no figure');
    expect(figure.bounds).toEqual({ x0: 10, y0: 5, x1: 29, y1: 54 });
  });

  it('reports nothing rather than guessing when the picture is all backdrop', () => {
    expect(findFigure(blank(8, 8, [12, 12, 12]))).toBeNull();
  });
});

describe('canonicalise', () => {
  it('stands the figure at the asked height with its feet on the ground row', () => {
    const img = onCheckerboard();
    const figure = findFigure(img);
    if (figure === null) throw new Error('no figure');
    const target = canonicalise(img, figure, CANVAS);
    if (target === null) throw new Error('no target');

    expect(target.figureH).toBe(Math.round(144 * 0.85));
    expect(target.figureW).toBe(Math.round(40 / target.reduction));
    let lowest = -1;
    let highest = 144;
    for (let y = 0; y < 144; y++) {
      for (let x = 0; x < 112; x++) {
        if (target.grid.cells[y * 112 + x] === TRANSPARENT) continue;
        if (y > lowest) lowest = y;
        if (y < highest) highest = y;
      }
    }
    expect(lowest).toBe(138);
    expect(highest).toBe(138 - target.figureH + 1);
  });

  it('keeps hard edges rather than smearing the backdrop into them', () => {
    // Mean colour written out directly came back visibly blurred beside the
    // original; the palette snap is what puts the edge back.
    const img = onCheckerboard();
    const figure = findFigure(img);
    if (figure === null) throw new Error('no figure');
    const target = canonicalise(img, figure, CANVAS);
    if (target === null) throw new Error('no target');
    // Two flat colours went in; the target must not be a gradient between them
    // and the checkerboard.
    expect(target.palette.length).toBeLessThanOrEqual(6);
    for (const [r, g, b] of target.palette) {
      const nearBackdrop = r > 200 && g > 200 && b > 200;
      expect(nearBackdrop).toBe(false);
    }
  });

  it('returns nothing when there is no figure rather than an empty canvas', () => {
    const img = blank(20, 20, [5, 5, 5]);
    const figure = { foreground: new Uint8Array(400), bounds: { x0: 0, y0: 0, x1: -1, y1: -1 }, footRow: 0 };
    expect(canonicalise(img, figure, CANVAS)).toBeNull();
  });
});

describe('referenceMaterials', () => {
  it('hands over ramps, commonest first, lightest shade first', () => {
    const img = onCheckerboard();
    const figure = findFigure(img);
    if (figure === null) throw new Error('no figure');
    const target = canonicalise(img, figure, CANVAS);
    if (target === null) throw new Error('no target');
    const materials = referenceMaterials(target);
    expect(materials.length).toBeGreaterThan(0);
    expect(materials[0].share).toBeGreaterThanOrEqual(materials[materials.length - 1].share);
    for (const material of materials) {
      for (const shade of material.shades) expect(shade).toMatch(/^[0-9a-f]{6}$/);
    }
    expect(materials.reduce((sum, m) => sum + m.share, 0)).toBeCloseTo(1, 5);
  });
});

describe('renderGrid', () => {
  it('magnifies with hard pixels onto the given backdrop', () => {
    const grid = { cols: 2, rows: 2, cells: Int16Array.from([TRANSPARENT, 0, 0, TRANSPARENT]) };
    const big = renderGrid(grid, [GOLD as unknown as readonly [number, number, number]], 4, [10, 10, 10]);
    expect(big.width).toBe(8);
    expect(big.data[(0 * 8 + 4) * 4]).toBe(GOLD[0]);
    expect(big.data[0]).toBe(10);
    expect(big.data[3]).toBe(255);
  });
});
