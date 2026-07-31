/**
 * The checks that are never negotiable (spec §8.1).
 *
 * A structural fault means the project cannot become pixels at all: a row of the
 * wrong length, an index the palette does not have, a clip naming a frame that
 * was deleted. These are always rejected — for model output, for tool input, for
 * a user edit and for an import alike, because there is only one validator and
 * every path goes through it.
 *
 * Nothing here throws. A caller repairing model output needs the whole list of
 * what is wrong in one pass, not the first fault and an exception.
 */

import { error, type Fault, type FaultLocation } from '../fault';
import { decodeGrid, MAX_PALETTE_SIZE, TRANSPARENT_INDEX, type GridRows } from '../grid';
import {
  MAX_CANVAS_SIDE,
  MAX_FRAMES_PER_CLIP,
  MAX_FRAME_DURATION_MS,
  MIN_FRAME_DURATION_MS,
  MIN_PLACEMENT_ON_CANVAS,
  findPart,
  placementRows,
  type PixelProject,
  type Size,
} from '../schema';

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

const isWholeNumber = (value: number): boolean => Number.isInteger(value);

export function validateStructure(project: PixelProject): Fault[] {
  const canvas = canvasFaults(project);
  const palette = paletteFaults(project);
  // Everything below decodes a grid against the canvas and the palette. If either
  // is not a usable size, those checks are not merely pointless — decoding
  // against a canvas of 12.5 cells allocates an array of 12.5 and throws inside
  // the validator, which is the one place that must never throw.
  if (!canDecode(project)) return [...canvas, ...palette];
  // A frame's checks lean on its parts: measuring how much of a part lands on the
  // canvas means decoding that part at the size it claims. So the parts are
  // checked first and only the sound ones are measured against — otherwise a part
  // claiming a million cells is decoded before anything says it is impossible.
  const parts = partFaults(project);
  return [...canvas, ...palette, ...parts.faults, ...frameFaults(project, parts.sound), ...clipFaults(project)];
}

function canDecode(project: PixelProject): boolean {
  const { width, height } = project.canvas;
  return isWholeNumber(width) && isWholeNumber(height) && width >= 1 && height >= 1 && project.palette.colours.length >= 1;
}

function canvasFaults(project: PixelProject): Fault[] {
  const faults: Fault[] = [];
  const { width, height } = project.canvas;
  if (!isWholeNumber(width) || !isWholeNumber(height) || width < 1 || height < 1) {
    faults.push(error('canvas-size', `the canvas is ${width}×${height}; both sides must be whole numbers of at least 1`));
  }
  if (width > MAX_CANVAS_SIDE || height > MAX_CANVAS_SIDE) {
    faults.push(error('canvas-size', `the canvas is ${width}×${height}; neither side may exceed ${MAX_CANVAS_SIDE}`));
  }
  if (!isWholeNumber(project.pivot.x) || !isWholeNumber(project.pivot.y)) {
    faults.push(error('pivot', `the pivot is at ${project.pivot.x},${project.pivot.y}; both must be whole numbers`));
  }
  if (project.pivot.x < 0 || project.pivot.y < 0 || project.pivot.x >= width || project.pivot.y >= height) {
    faults.push(error('pivot', `the pivot at ${project.pivot.x},${project.pivot.y} is outside the ${width}×${height} canvas`));
  }
  return faults;
}

function paletteFaults(project: PixelProject): Fault[] {
  const faults: Fault[] = [];
  const { colours, ramps } = project.palette;

  if (colours.length < 1) faults.push(error('palette-size', 'the palette is empty; index 0 must exist and is always transparent'));
  if (colours.length > MAX_PALETTE_SIZE) {
    faults.push(error('palette-size', `the palette holds ${colours.length} colours; the most a project may have is ${MAX_PALETTE_SIZE}`));
  }
  colours.forEach((colour, index) => {
    // Index 0 is transparent for life, so its colour is never drawn — but it
    // still has to be a colour, because a UI swatch has to show something.
    if (!HEX_COLOUR.test(colour.hex)) {
      faults.push(error('palette-colour', `palette index ${index} is "${colour.hex}"; write a colour as #rrggbb`, { index }));
    }
  });

  const seenRamps = new Set<string>();
  for (const ramp of ramps) {
    if (seenRamps.has(ramp.id)) faults.push(error('duplicate-id', `two ramps share the id "${ramp.id}"`));
    seenRamps.add(ramp.id);
    for (const index of ramp.indexes) {
      if (!isWholeNumber(index)) {
        faults.push(error('ramp-index', `ramp "${ramp.id}" names ${index}, which is not a palette index`, { index }));
      } else if (index === TRANSPARENT_INDEX) {
        faults.push(error('ramp-index', `ramp "${ramp.id}" includes index 0, which is transparent and shades nothing`, { index }));
      } else if (index < 0 || index >= colours.length) {
        faults.push(error('ramp-index', `ramp "${ramp.id}" names index ${index}, which the palette does not have`, { index }));
      }
    }
  }
  return faults;
}

interface PartCheck {
  faults: Fault[];
  /** Parts whose window and size are usable, so their pixels can be measured. */
  sound: Set<string>;
}

function partFaults(project: PixelProject): PartCheck {
  const faults: Fault[] = [];
  const sound = new Set<string>();
  const paletteSize = project.palette.colours.length;
  const seenParts = new Set<string>();

  for (const part of project.parts) {
    if (seenParts.has(part.id)) faults.push(error('duplicate-id', `two parts share the id "${part.id}"`, { partId: part.id }));
    seenParts.add(part.id);

    const { width, height } = part.size;
    if (!isWholeNumber(width) || !isWholeNumber(height) || width < 1 || height < 1) {
      faults.push(error('part-size', `part "${part.id}" is ${width}×${height}; both sides must be whole numbers of at least 1`, { partId: part.id }));
      continue;
    }
    if (!isWholeNumber(part.pivot.x) || !isWholeNumber(part.pivot.y)) {
      faults.push(error('part-pivot', `part "${part.id}" pivots at ${part.pivot.x},${part.pivot.y}; both must be whole numbers`, { partId: part.id }));
    }
    if (!isWholeNumber(part.origin.x) || !isWholeNumber(part.origin.y)) {
      faults.push(error('part-origin', `part "${part.id}" starts at ${part.origin.x},${part.origin.y}; both must be whole numbers`, { partId: part.id }));
      continue;
    }
    if (!fitsInside(project.canvas, part.origin.x, part.origin.y, width, height)) {
      faults.push(
        error(
          'part-bounds',
          `part "${part.id}" was cut from ${part.origin.x},${part.origin.y} at ${width}×${height}, which reaches outside the ${project.canvas.width}×${project.canvas.height} canvas`,
          { partId: part.id },
        ),
      );
      // A part whose window is off the canvas has nothing useful to say about its
      // pixels yet, and a part claiming a size of a million cells must not be
      // decoded to find that out.
      continue;
    }

    faults.push(...rowsFaults(part.rows, part.size, paletteSize, `part "${part.id}"`, { partId: part.id }));

    const seenVariants = new Set<string>();
    for (const variant of part.variants) {
      if (seenVariants.has(variant.id)) {
        faults.push(error('duplicate-id', `part "${part.id}" has two variants with the id "${variant.id}"`, { partId: part.id, variantId: variant.id }));
      }
      seenVariants.add(variant.id);
      // A variant is an alternative drawing of the *same* part, so it occupies
      // the same window. A variant of a different size would move the joint.
      faults.push(
        ...rowsFaults(variant.rows, part.size, paletteSize, `variant "${variant.id}" of part "${part.id}"`, {
          partId: part.id,
          variantId: variant.id,
        }),
      );
    }
    sound.add(part.id);
  }
  return { faults, sound };
}

function frameFaults(project: PixelProject, soundParts: ReadonlySet<string>): Fault[] {
  const faults: Fault[] = [];
  const paletteSize = project.palette.colours.length;
  const seenFrames = new Set<string>();

  for (const frame of project.frames) {
    if (seenFrames.has(frame.id)) faults.push(error('duplicate-id', `two frames share the id "${frame.id}"`, { frameId: frame.id }));
    seenFrames.add(frame.id);

    if (frame.rows !== undefined) {
      faults.push(...rowsFaults(frame.rows, project.canvas, paletteSize, `frame "${frame.id}"`, { frameId: frame.id }));
    }

    for (const placement of frame.placements) {
      const part = findPart(project, placement.partId);
      if (part === undefined) {
        faults.push(error('unknown-part', `frame "${frame.id}" places part "${placement.partId}", which the project does not have`, { frameId: frame.id }));
        continue;
      }
      const rows = placementRows(part, placement);
      if (rows === undefined) {
        faults.push(
          error('unknown-variant', `frame "${frame.id}" places variant "${placement.variantId}" of part "${part.id}", which the part does not have`, {
            frameId: frame.id,
            partId: part.id,
          }),
        );
        continue;
      }
      if (!isWholeNumber(placement.dx) || !isWholeNumber(placement.dy)) {
        faults.push(
          error('placement-offset', `frame "${frame.id}" moves part "${part.id}" by ${placement.dx},${placement.dy}; offsets are whole pixels`, {
            frameId: frame.id,
            partId: part.id,
          }),
        );
        continue;
      }
      if (soundParts.has(part.id)) {
        faults.push(...placementCoverageFaults(project, frame.id, part.id, rows, part.size, part.origin.x + placement.dx, part.origin.y + placement.dy));
      }
    }

    const lockedCells = new Set<string>();
    for (const lock of frame.locks) {
      // Two locks on one cell is two answers to "what did the user draw here?".
      // Whichever won would be an accident of array order.
      if (lockedCells.has(`${lock.x},${lock.y}`)) {
        faults.push(error('duplicate-lock', `frame "${frame.id}" locks cell ${lock.x},${lock.y} twice`, { frameId: frame.id, x: lock.x, y: lock.y }));
      }
      lockedCells.add(`${lock.x},${lock.y}`);
    }

    for (const cell of [...frame.patch, ...frame.locks]) {
      if (!isWholeNumber(cell.x) || !isWholeNumber(cell.y)) {
        faults.push(
          error('cell-coordinate', `frame "${frame.id}" writes cell ${cell.x},${cell.y}; a cell sits at whole-number coordinates`, { frameId: frame.id, x: cell.x, y: cell.y }),
        );
      } else if (cell.x < 0 || cell.y < 0 || cell.x >= project.canvas.width || cell.y >= project.canvas.height) {
        faults.push(error('cell-bounds', `frame "${frame.id}" writes cell ${cell.x},${cell.y}, which is outside the canvas`, { frameId: frame.id, x: cell.x, y: cell.y }));
      }
      if (!isWholeNumber(cell.index) || cell.index < 0 || cell.index >= paletteSize) {
        faults.push(
          error('index-outside-palette', `frame "${frame.id}" writes index ${cell.index} at ${cell.x},${cell.y}, but the palette holds ${paletteSize} colours`, {
            frameId: frame.id,
            x: cell.x,
            y: cell.y,
            index: cell.index,
          }),
        );
      }
    }
  }
  return faults;
}

function clipFaults(project: PixelProject): Fault[] {
  const faults: Fault[] = [];
  const frameIds = new Set(project.frames.map((frame) => frame.id));
  const seenClips = new Set<string>();

  for (const clip of project.clips) {
    if (seenClips.has(clip.id)) faults.push(error('duplicate-id', `two clips share the id "${clip.id}"`, { clipId: clip.id }));
    seenClips.add(clip.id);

    if (clip.frames.length < 1) faults.push(error('clip-empty', `clip "${clip.name}" has no frames`, { clipId: clip.id }));
    if (clip.frames.length > MAX_FRAMES_PER_CLIP) {
      faults.push(error('clip-length', `clip "${clip.name}" has ${clip.frames.length} frames; the most a clip may have is ${MAX_FRAMES_PER_CLIP}`, { clipId: clip.id }));
    }
    if (!isWholeNumber(clip.motionBudgetPx) || clip.motionBudgetPx < 0) {
      faults.push(error('motion-budget', `clip "${clip.name}" declares a motion budget of ${clip.motionBudgetPx}px; it must be a whole number of pixels`, { clipId: clip.id }));
    }
    clip.frames.forEach((entry, position) => {
      if (!frameIds.has(entry.frameId)) {
        faults.push(error('unknown-frame', `clip "${clip.name}" position ${position} names frame "${entry.frameId}", which the project does not have`, { clipId: clip.id }));
      }
      if (!isWholeNumber(entry.durationMs) || entry.durationMs < MIN_FRAME_DURATION_MS || entry.durationMs > MAX_FRAME_DURATION_MS) {
        faults.push(
          error('frame-duration', `clip "${clip.name}" position ${position} lasts ${entry.durationMs}ms; a frame lasts a whole ${MIN_FRAME_DURATION_MS}…${MAX_FRAME_DURATION_MS}ms`, {
            clipId: clip.id,
            frameId: entry.frameId,
          }),
        );
      }
    });
  }
  return faults;
}

/** Rows that decode cleanly at exactly the size they claim to be. */
function rowsFaults(rows: GridRows, size: Size, paletteSize: number, subject: string, where: FaultLocation): Fault[] {
  const { faults } = decodeGrid(rows, size.width, size.height, paletteSize);
  return faults.map((fault) => ({ ...fault, message: `${subject}: ${fault.message}`, where: { ...fault.where, ...where } }));
}

function fitsInside(canvas: Size, x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x + width <= canvas.width && y + height <= canvas.height;
}

/**
 * A placement must keep most of its part on the canvas.
 *
 * Moving a part right off the edge is how a run loses a limb while every other
 * check still passes: the grid is valid, the palette is valid, and the character
 * has one arm. The measure is drawn pixels, not the part's box, because a part
 * is mostly transparent and its box says little about what is visible.
 */
function placementCoverageFaults(
  project: PixelProject,
  frameId: string,
  partId: string,
  rows: GridRows,
  size: Size,
  left: number,
  top: number,
): Fault[] {
  const { grid } = decodeGrid(rows, size.width, size.height, project.palette.colours.length);
  let drawn = 0;
  let onCanvas = 0;
  grid.forEach((row, y) =>
    row.forEach((value, x) => {
      if (value === TRANSPARENT_INDEX) return;
      drawn += 1;
      const targetX = left + x;
      const targetY = top + y;
      if (targetX >= 0 && targetY >= 0 && targetX < project.canvas.width && targetY < project.canvas.height) onCanvas += 1;
    }),
  );
  if (drawn === 0 || onCanvas / drawn >= MIN_PLACEMENT_ON_CANVAS) return [];
  const percent = Math.round((onCanvas / drawn) * 100);
  return [
    error('placement-off-canvas', `frame "${frameId}" moves part "${partId}" so far that only ${percent}% of it lands on the canvas`, { frameId, partId }),
  ];
}
