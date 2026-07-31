/**
 * Capping the palette (D17).
 *
 * Ingestion measures a palette — 66 for the reference — but a measured palette
 * is not always the wanted one. A 16 colour cap is a legitimate art direction,
 * and so is a fixed set the user supplies. The cap belongs to the character, so
 * every animation inherits it and no sequence can drift onto a wider palette
 * than its siblings.
 *
 * The reduction is a weighted median cut in OKLab: weighted, because a cap that
 * ignored how much of the sprite each colour covers would spend half its budget
 * on the eye highlights; OKLab, because the entries that survive have to be the
 * ones the eye would have chosen.
 *
 * Colour residual tracks palette size (D37) — the knight's 36 colours give 21 to
 * 37, the slime's 4 give 39 to 137 — so a character capped very low will not sit
 * close to its own palette, and the fidelity threshold cannot be one number for
 * every character.
 */

import { labDistance, nearestEntry, oklab, type Lab } from './colour';
import type { Palette, Rgb } from './types';
import { TRANSPARENT } from './types';

export interface WeightedColour {
  rgb: Rgb;
  lab: Lab;
  weight: number;
}

/** How many cells each palette entry covers. */
export function paletteWeights(cells: Int16Array, palette: Palette): WeightedColour[] {
  const counts = new Int32Array(palette.length);
  for (const index of cells) if (index >= 0 && index < palette.length) counts[index]!++;
  return palette.map((rgb, index) => ({ rgb, lab: oklab(rgb), weight: counts[index] ?? 0 }));
}

function box(colours: WeightedColour[]): { spread: number; axis: 0 | 1 | 2 } {
  let spread = -1;
  let axis: 0 | 1 | 2 = 0;
  for (const candidate of [0, 1, 2] as const) {
    const values = colours.map((colour) => colour.lab[candidate]);
    // Lightness carries most of what the eye reads in a sprite ramp, so it is
    // weighted up against the two chroma axes rather than treated as an equal.
    const range = (Math.max(...values) - Math.min(...values)) * (candidate === 0 ? 1.4 : 1);
    if (range > spread) {
      spread = range;
      axis = candidate;
    }
  }
  return { spread, axis };
}

function meanOf(colours: WeightedColour[]): Rgb {
  const total = colours.reduce((sum, colour) => sum + Math.max(colour.weight, 1), 0);
  const channel = (index: 0 | 1 | 2): number =>
    Math.round(
      colours.reduce((sum, colour) => sum + colour.rgb[index] * Math.max(colour.weight, 1), 0) / total,
    );
  return [channel(0), channel(1), channel(2)];
}

/**
 * Reduce a palette to `cap` entries, keeping the entries the sprite leans on.
 *
 * Deterministic: the same palette and the same cell counts always produce the
 * same answer, which matters because the user approves what they saw.
 */
export function capPalette(cells: Int16Array, palette: Palette, cap: number): Rgb[] {
  if (cap >= palette.length || cap < 1) return [...palette];
  const weighted = paletteWeights(cells, palette).filter((colour) => colour.weight > 0);
  const source = weighted.length > 0 ? weighted : paletteWeights(cells, palette);

  let groups: WeightedColour[][] = [source];
  while (groups.length < cap) {
    let target = -1;
    let widest = 0;
    for (const [i, group] of groups.entries()) {
      if (group.length < 2) continue;
      const { spread } = box(group);
      if (spread > widest) {
        widest = spread;
        target = i;
      }
    }
    if (target < 0) break;
    const group = groups[target]!;
    const { axis } = box(group);
    const ordered = group.toSorted((a, b) => a.lab[axis] - b.lab[axis]);
    // Split where half the *weight* lies, not half the entries: one colour
    // covering most of the sprite deserves a bucket of its own.
    const total = ordered.reduce((sum, colour) => sum + Math.max(colour.weight, 1), 0);
    let running = 0;
    let split = 1;
    for (const [i, colour] of ordered.entries()) {
      running += Math.max(colour.weight, 1);
      if (running >= total / 2) {
        split = Math.min(Math.max(i + 1, 1), ordered.length - 1);
        break;
      }
    }
    groups = [...groups.slice(0, target), ordered.slice(0, split), ordered.slice(split), ...groups.slice(target + 1)];
  }

  return groups.filter((group) => group.length > 0).map((group) => meanOf(group));
}

/** Re-index a recovered sprite onto a new palette. */
export function remapCells(cells: Int16Array, from: Palette, to: Palette): Int16Array {
  const toLab = to.map((entry) => oklab(entry));
  const lookup = from.map((entry) => nearestEntry(toLab, oklab(entry)).index);
  const out = new Int16Array(cells.length);
  for (const [i, index] of cells.entries()) {
    out[i] = index < 0 ? TRANSPARENT : lookup[index] ?? 0;
  }
  return out;
}

/**
 * How far a sprite sits from its own palette, in OKLab, once capped.
 *
 * The number the user is shown before approving a cap: it is the honest cost of
 * the art direction they just chose.
 */
export function capResidual(cells: Int16Array, from: Palette, to: Palette): number {
  const toLab = to.map((entry) => oklab(entry));
  let sum = 0;
  let n = 0;
  for (const index of cells) {
    const entry = index >= 0 ? from[index] : undefined;
    if (entry === undefined) continue;
    const lab = oklab(entry);
    sum += labDistance(lab, toLab[nearestEntry(toLab, lab).index] ?? lab);
    n++;
  }
  return n > 0 ? sum / n : 0;
}

/** Palette entries must be distinct, or two indexes would be one colour. */
export function dedupePalette(palette: Palette): Rgb[] {
  const seen = new Set<string>();
  const out: Rgb[] = [];
  for (const entry of palette) {
    const key = entry.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([entry[0], entry[1], entry[2]]);
  }
  return out;
}
