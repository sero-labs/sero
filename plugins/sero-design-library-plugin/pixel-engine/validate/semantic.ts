/**
 * The checks that read the art rather than its shape (spec §8.2).
 *
 * Structural faults say a project cannot become pixels. Semantic faults say it
 * became the wrong pixels: the character drifted across the frame, a part was
 * quietly repainted instead of given a variant, the silhouette fell into pieces.
 * Each one here was earned by a fault that passed every structural check and
 * still looked broken.
 *
 * Severity is not decoration. An error blocks a run; a warning is reported and
 * still compiles, because judgement calls — an unused palette index, a lone
 * pixel — must not throw a good sprite away.
 */

import { error, warning, type Fault } from '../fault';
import { boundingBox, cellAt, countFilled, decodeGrid, TRANSPARENT_INDEX, type Grid } from '../grid';
import { resolveFrameTraced } from '../resolve';
import { findFrame, findPart, placementRows, type Clip, type Frame, type PixelProject } from '../schema';

/** Above this share of the drawn pixels, loose cells are noise rather than detail. */
const ORPHAN_ERROR_RATIO = 0.01;

const NEIGHBOURS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function validateSemantics(project: PixelProject): Fault[] {
  const faults: Fault[] = [];
  for (const frame of project.frames) {
    const grid = resolveFrameTraced(project, frame).grid;
    faults.push(...orphanFaults(grid, frame.id));
    faults.push(...silhouetteFaults(project, grid, frame.id));
    faults.push(...partIntegrityFaults(project, frame));
  }
  for (const clip of project.clips) faults.push(...driftFaults(project, clip));
  faults.push(...paletteHygieneFaults(project));
  return faults;
}

/**
 * Any write to a locked cell (P9).
 *
 * Resolution already makes locks win, so this check exists for the moment
 * *before* that: a tool handing in a whole grid needs to be told which of its
 * cells were discarded, by coordinate, or it will keep writing them.
 */
export function checkLockViolations(project: PixelProject, frame: Frame, proposed: Grid): Fault[] {
  return frame.locks
    .filter((lock) => cellAt(proposed, lock.x, lock.y) !== lock.index)
    .map((lock) =>
      error(
        'lock-violation',
        `cell ${lock.x},${lock.y} is locked to index ${lock.index} by hand and cannot be changed; work around it`,
        { frameId: frame.id, x: lock.x, y: lock.y, index: lock.index },
      ),
    );
}

/**
 * How far the silhouette box moved against what the clip declared.
 *
 * The measure is the box, not the pixels, because that is what the eye reads as
 * the character sliding. A bounding walk declares a bigger budget than an idle
 * breath, so the check stays on for both rather than being switched off for one.
 */
function driftFaults(project: PixelProject, clip: Clip): Fault[] {
  const faults: Fault[] = [];
  const boxes = clip.frames.map((entry) => {
    const frame = findFrame(project, entry.frameId);
    return frame === undefined ? null : boundingBox(resolveFrameTraced(project, frame).grid);
  });

  const compare = (fromIndex: number, toIndex: number): void => {
    const from = boxes[fromIndex];
    const to = boxes[toIndex];
    if (from === null || to === null || from === undefined || to === undefined) return;
    const moves: [string, number][] = [
      ['left', Math.abs(to.x - from.x)],
      ['top', Math.abs(to.y - from.y)],
      ['width', Math.abs(to.width - from.width)],
      ['height', Math.abs(to.height - from.height)],
    ];
    for (const [measure, distance] of moves) {
      if (distance <= clip.motionBudgetPx) continue;
      faults.push(
        error(
          'drift',
          `clip "${clip.name}" frame ${toIndex}: the silhouette ${measure} moved ${distance}px against a motion budget of ${clip.motionBudgetPx}px — move the parts less, or give a part that hangs or trails its own placement`,
          { clipId: clip.id, frameId: clip.frames[toIndex]?.frameId },
        ),
      );
    }
  };

  for (let index = 1; index < boxes.length; index += 1) compare(index - 1, index);
  // A loop's last frame runs straight into its first, so the seam between them
  // is a real transition and drifts like any other.
  if (clip.loop === 'loop' && boxes.length > 1) compare(boxes.length - 1, 0);
  return faults;
}

/**
 * A part's pixels must survive being placed (P4, acceptance §18.5).
 *
 * Only cells the placement still owns are compared: a later part covering an
 * earlier one is the joint overlap doing its job. Locked cells are skipped
 * because the user's pixels beat the rig. What is left is a patch repainting a
 * part, which is exactly how a character drifts between frames.
 */
function partIntegrityFaults(project: PixelProject, frame: Frame): Fault[] {
  const { grid, owner } = resolveFrameTraced(project, frame);
  const locked = new Set(frame.locks.map((lock) => `${lock.x},${lock.y}`));
  const faults: Fault[] = [];

  frame.placements.forEach((placement, placementIndex) => {
    if (placement.variantId !== undefined) return;
    const part = findPart(project, placement.partId);
    if (part === undefined) return;
    const rows = placementRows(part, placement);
    if (rows === undefined) return;
    const pixels = decodeGrid(rows, part.size.width, part.size.height, project.palette.colours.length).grid;
    const left = part.origin.x + placement.dx;
    const top = part.origin.y + placement.dy;

    const repainted: string[] = [];
    pixels.forEach((row, y) =>
      row.forEach((value, x) => {
        const targetX = left + (placement.flipX === true ? row.length - 1 - x : x);
        const targetY = top + y;
        if (owner[targetY]?.[targetX] !== placementIndex) return;
        if (locked.has(`${targetX},${targetY}`)) return;
        if (grid[targetY][targetX] !== value) repainted.push(`${targetX},${targetY}`);
      }),
    );

    if (repainted.length > 0) {
      faults.push(
        error(
          'part-integrity',
          `frame "${frame.id}" repaints ${repainted.length} cell${repainted.length === 1 ? '' : 's'} of part "${part.id}" (${repainted.slice(0, 8).join(' ')}); declare a variant of the part instead, so every frame that uses the part stays identical`,
          { frameId: frame.id, partId: part.id },
        ),
      );
    }
  });
  return faults;
}

/** Lone cells with nothing beside them — the usual tell of generated noise. */
function orphanFaults(grid: Grid, frameId: string): Fault[] {
  const orphans: [number, number][] = [];
  grid.forEach((row, y) =>
    row.forEach((value, x) => {
      if (value === TRANSPARENT_INDEX) return;
      const attached = NEIGHBOURS.some(([dx, dy]) => cellAt(grid, x + dx, y + dy) !== TRANSPARENT_INDEX);
      if (!attached) orphans.push([x, y]);
    }),
  );
  if (orphans.length === 0) return [];

  const faults = orphans
    .slice(0, 8)
    .map(([x, y]) => warning('orphan-cell', `frame "${frameId}": the cell at ${x},${y} touches nothing`, { frameId, x, y }));
  const filled = countFilled(grid);
  if (orphans.length > Math.max(3, filled * ORPHAN_ERROR_RATIO)) {
    faults.push(
      error('orphan-cells', `frame "${frameId}" has ${orphans.length} isolated cells in ${filled} drawn cells; the art is speckled rather than shaded`, { frameId }),
    );
  }
  return faults;
}

/**
 * One body, in one piece.
 *
 * A character or an item that resolves into two islands has usually lost a limb
 * off the canvas or grown a floating fragment. Artwork that is genuinely in
 * pieces says so with `detachedParts`, which is a statement about the art rather
 * than the check being switched off.
 */
function silhouetteFaults(project: PixelProject, grid: Grid, frameId: string): Fault[] {
  if (project.detachedParts === true) return [];
  if (project.kind !== 'character' && project.kind !== 'item') return [];
  const regions = connectedRegions(grid);
  if (regions.length <= 1) return [];
  const largest = Math.max(...regions);
  const loose = regions.filter((size) => size !== largest).reduce((total, size) => total + size, 0);
  return [
    error(
      'silhouette-broken',
      `frame "${frameId}" resolves into ${regions.length} separate pieces: ${largest} cells in the body and ${loose} adrift — join them, or set the project to allow detached parts`,
      { frameId },
    ),
  ];
}

/** The size of each 4-connected region of drawn cells. */
function connectedRegions(grid: Grid): number[] {
  const seen = grid.map((row) => row.map(() => false));
  const sizes: number[] = [];
  grid.forEach((row, startY) =>
    row.forEach((value, startX) => {
      if (value === TRANSPARENT_INDEX || seen[startY][startX]) return;
      let size = 0;
      const stack: [number, number][] = [[startX, startY]];
      seen[startY][startX] = true;
      while (stack.length > 0) {
        const [x, y] = stack.pop() as [number, number];
        size += 1;
        for (const [dx, dy] of NEIGHBOURS) {
          const nextX = x + dx;
          const nextY = y + dy;
          if (cellAt(grid, nextX, nextY) === TRANSPARENT_INDEX) continue;
          if (seen[nextY]?.[nextX] !== false) continue;
          seen[nextY][nextX] = true;
          stack.push([nextX, nextY]);
        }
      }
      sizes.push(size);
    }),
  );
  return sizes;
}

/**
 * Palette faults that cost the art rather than break it (spec §8.2).
 *
 * All three are warnings. A palette with a spare index still compiles, and a
 * good sprite must never be thrown away over housekeeping — but a model told
 * about them cleans up in the same pass it was going to make anyway.
 */
function paletteHygieneFaults(project: PixelProject): Fault[] {
  const faults: Fault[] = [];
  const uses = new Map<number, number>();
  const grids = project.frames.map((frame) => resolveFrameTraced(project, frame).grid);

  for (const grid of grids) {
    for (const row of grid) {
      for (const value of row) uses.set(value, (uses.get(value) ?? 0) + 1);
    }
  }

  project.palette.colours.forEach((colour, index) => {
    if (index === TRANSPARENT_INDEX) return;
    const count = uses.get(index) ?? 0;
    const name = colour.name === undefined ? `index ${index}` : `${colour.name} (index ${index})`;
    if (count === 0) faults.push(warning('palette-unused', `${name} is in the palette but nothing uses it`, { index }));
    else if (count === 1) faults.push(warning('palette-single-use', `${name} colours one cell in the whole project`, { index }));
  });

  const rampOf = new Map<number, string>();
  for (const ramp of project.palette.ramps) {
    for (const index of ramp.indexes) rampOf.set(index, ramp.id);
  }
  project.frames.forEach((frame, frameIndex) => {
    const grid = grids[frameIndex];
    let stray = 0;
    grid.forEach((row, y) =>
      row.forEach((value, x) => {
        const ramp = rampOf.get(value);
        if (ramp === undefined) return;
        const beside = NEIGHBOURS.some(([dx, dy]) => rampOf.get(cellAt(grid, x + dx, y + dy)) === ramp);
        if (!beside) stray += 1;
      }),
    );
    if (stray > 0) {
      faults.push(
        warning('palette-stray-shade', `frame "${frame.id}" has ${stray} cell${stray === 1 ? '' : 's'} of a shading ramp with no other shade of that ramp beside them`, {
          frameId: frame.id,
        }),
      );
    }
  });
  return faults;
}
