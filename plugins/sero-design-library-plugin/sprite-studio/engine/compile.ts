/**
 * The whole deterministic stage: drawn plates in, an indexed sprite sequence out.
 *
 * No AI anywhere in this file, and no file system, network or clock (D15). The
 * order of the stages is load-bearing and is the part two reviews changed:
 *
 *   key → measure → ground → correct drift → resample → align → quantise
 *
 * Alignment sits before any palette decision (D26), and the correction is
 * applied to the reference point rather than to the character's height (D25).
 */

import { alignRaw } from './align';
import { buildRamps, rampIndex, rampUsage } from './colour';
import { keepLargestBody, keyForeground } from './key';
import { measureSilhouette } from './measure';
import { quantiseSequence, staticChurn, type QuantiseOptions } from './quantise';
import { rawGrid } from './resample';
import { detectGrounded, rootCorrections } from './root';
import type {
  CellGrid,
  Foreground,
  Offset,
  Palette,
  Ramp,
  RampUsage,
  RawGrid,
  Silhouette,
  SourcePlate,
} from './types';

export interface CompileOptions {
  palette: Palette;
  /**
   * Source pixels per art pixel, fixed for the whole sequence and taken from
   * the character (D12). A model that draws the character bigger produces a
   * bigger sprite, and the body-size check catches it.
   */
  scale: number;
  /**
   * The AI's declaration of which frames are on the ground, when it made one.
   * Absent means "work it out from the pixels", which is also what the
   * declaration is checked against.
   */
  grounded?: boolean[];
  quantise?: QuantiseOptions;
  /** The margin of empty cells left around the derived canvas. */
  padding?: number;
}

export interface CompiledFrame {
  cells: CellGrid;
  silhouette: Silhouette;
  /** Where this frame's feet sit, in art pixels above the animation's baseline. */
  footHeight: number;
  grounded: boolean;
  durationMs: number;
  /** The alignment against the previous frame — how far the model drifted. */
  offset: Offset;
  /** How far the drawn colours sat from the entries they were given. */
  residual: number;
  offPalette: number;
}

export interface CompiledAnimation {
  cols: number;
  rows: number;
  /** The cell the character's root sits on: every frame is placed against this. */
  anchorCol: number;
  anchorRow: number;
  scale: number;
  frames: CompiledFrame[];
  /** Ground contact as the pixels report it, whatever was declared. */
  groundedFromPixels: boolean[];
  /** True when nothing touched the ground, so no drift correction was applied. */
  uncorrected: boolean;
  interpolated: number;
  churn: { withMemory: number; withoutMemory: number };
  ramps: Ramp[];
  rampOf: Int32Array;
  /** Ramp usage per frame, for the fidelity check (D27). */
  rampUsage: RampUsage[][];
  /** The unquantised grids, kept for a re-quantise at a different palette cap. */
  grids: RawGrid[];
}

/** One plate, keyed and measured. */
function prepare(plate: SourcePlate): { foreground: Foreground; silhouette: Silhouette } | null {
  const keyed = keyForeground(plate.image);
  const { foreground, detached } = keepLargestBody(keyed, plate.image.width, plate.image.height);
  const silhouette = measureSilhouette(plate.image, foreground, detached);
  return silhouette === null ? null : { foreground, silhouette };
}

export function compileAnimation(
  plates: SourcePlate[],
  options: CompileOptions,
): CompiledAnimation | null {
  const padding = options.padding ?? 1;
  const prepared = plates
    .map((plate) => ({ plate, ...(prepare(plate) ?? {}) }))
    .filter(
      (entry): entry is { plate: SourcePlate; foreground: Foreground; silhouette: Silhouette } =>
        entry.foreground !== undefined && entry.silhouette !== undefined,
    );
  if (prepared.length === 0) return null;

  const { scale, palette } = options;
  const silhouettes = prepared.map((entry) => entry.silhouette);
  const groundedFromPixels = detectGrounded(silhouettes, scale);
  const grounded = options.grounded ?? groundedFromPixels;
  const { reference, corrections, interpolated, trusted } = rootCorrections(silhouettes, grounded);

  // The canvas holds every frame's reach from the one fixed reference point, so
  // it can never be too small (D19) and the character keeps the same place in
  // every animation he appears in.
  let above = 0;
  let below = 0;
  let left = 0;
  let right = 0;
  for (const [i, silhouette] of silhouettes.entries()) {
    const fix = corrections[i] ?? { x: 0, y: 0 };
    const y = reference.y + fix.y;
    const x = reference.x + fix.x;
    above = Math.max(above, (y - silhouette.minY) / scale);
    below = Math.max(below, (silhouette.maxY + 1 - y) / scale);
    left = Math.max(left, (x - silhouette.minX) / scale);
    right = Math.max(right, (silhouette.maxX + 1 - x) / scale);
  }
  const cols = Math.ceil(left + right) + padding * 2;
  const rows = Math.ceil(above + below) + padding * 2;
  const anchorCol = Math.ceil(left) + padding;
  const anchorRow = Math.ceil(above) + padding;

  const grids = prepared.map((entry, i) => {
    // One reference point for the whole animation, minus this frame's drift.
    // The character's own height in the picture is left exactly as drawn: that
    // height is the jump.
    const fix = corrections[i] ?? { x: 0, y: 0 };
    const originX = reference.x + fix.x - anchorCol * scale;
    const originY = reference.y + fix.y - anchorRow * scale;
    return rawGrid(entry.plate.image, entry.foreground, scale, originX, originY, cols, rows);
  });

  const withMemory = quantiseSequence(grids, palette, options.quantise);
  // Measured so the checkpoint can state what the memory actually bought on this
  // sequence, rather than asserting that it works.
  const withoutMemory = quantiseSequence(grids, palette, { ...options.quantise, memory: false });

  const ramps = buildRamps(palette);
  const rampOf = rampIndex(ramps, palette.length);

  const frames: CompiledFrame[] = prepared.map((entry, i) => {
    const fix = corrections[i] ?? { x: 0, y: 0 };
    const silhouette = entry.silhouette;
    return {
      cells: withMemory.frames[i] ?? { cols, rows, cells: new Int16Array(cols * rows).fill(-1) },
      silhouette,
      // Foot height in art pixels above the reference — this is the arc.
      footHeight: (reference.y + fix.y - silhouette.footY) / scale,
      grounded: grounded[i] ?? false,
      durationMs: entry.plate.durationMs,
      offset: withMemory.offsets[i] ?? { dx: 0, dy: 0 },
      residual: withMemory.residuals[i] ?? 0,
      offPalette: withMemory.offPalette[i] ?? 0,
    };
  });

  return {
    cols,
    rows,
    anchorCol,
    anchorRow,
    scale,
    frames,
    groundedFromPixels,
    uncorrected: trusted,
    interpolated,
    churn: {
      withMemory: staticChurn(grids, withMemory.frames, withMemory.offsets).churn,
      withoutMemory: staticChurn(grids, withoutMemory.frames, withoutMemory.offsets).churn,
    },
    ramps,
    rampOf,
    rampUsage: withMemory.frames.map((frame) => rampUsage(frame.cells, ramps, rampOf)),
    grids,
  };
}

/**
 * Re-quantise a compiled animation onto a different palette without going back
 * to the source pictures — what a palette cap change costs after the fact.
 */
export function requantise(
  animation: CompiledAnimation,
  palette: Palette,
  options: QuantiseOptions = {},
): CellGrid[] {
  return quantiseSequence(animation.grids, palette, options).frames;
}

export { alignRaw };
