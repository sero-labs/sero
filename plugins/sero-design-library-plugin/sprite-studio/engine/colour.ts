/**
 * Perceptual colour, and the ramps the fidelity check works on (D27).
 *
 * "One shade" has to mean what the eye thinks it means, so distances are
 * measured in OKLab rather than in sRGB.
 */

import type { Palette, Ramp, RampUsage, Rgb } from './types';

export type Lab = readonly [number, number, number];

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** sRGB 0-255 to OKLab. */
export function oklab([r, g, b]: Rgb): Lab {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function labDistance(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** The palette entry closest to a colour, and how far away it sat. */
export function nearestEntry(paletteLab: Lab[], lab: Lab): { index: number; distance: number } {
  let best = 0;
  let bestDistance = Infinity;
  for (const [index, entry] of paletteLab.entries()) {
    const distance = labDistance(entry, lab);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return { index: best, distance: bestDistance };
}

interface RampCandidate {
  neutral: boolean;
  hue: number;
  members: { index: number; lab: Lab; chroma: number; hue: number; L: number }[];
}

/**
 * Group a palette into material ramps.
 *
 * A ramp is a set of entries that share a hue and differ in lightness — the
 * shades of the shirt, the shades of the leather. Grouping by hue direction and
 * chroma, then ordering by lightness, is enough: the check only needs to know
 * that two entries belong to the same material, not what the material is called.
 */
export function buildRamps(palette: Palette, { hueTolerance = 0.42 } = {}): Ramp[] {
  const entries = palette.map((rgb, index) => {
    const lab = oklab(rgb);
    return {
      index,
      lab,
      chroma: Math.hypot(lab[1], lab[2]),
      hue: Math.atan2(lab[2], lab[1]),
      L: lab[0],
    };
  });

  const candidates: RampCandidate[] = [];
  for (const entry of entries) {
    // Near-neutral colours have no meaningful hue, so they form their own ramp.
    const neutral = entry.chroma < 0.02;
    let found = candidates.find((ramp) => {
      if (ramp.neutral !== neutral) return false;
      if (neutral) return true;
      let delta = Math.abs(ramp.hue - entry.hue);
      if (delta > Math.PI) delta = 2 * Math.PI - delta;
      return delta < hueTolerance;
    });
    if (!found) {
      found = { neutral, hue: entry.hue, members: [] };
      candidates.push(found);
    }
    found.members.push(entry);
    if (!neutral) {
      // Keep the ramp's hue as the chroma-weighted mean of its members.
      const weight = found.members.reduce((sum, m) => sum + m.chroma, 0);
      found.hue = Math.atan2(
        found.members.reduce((sum, m) => sum + m.chroma * Math.sin(m.hue), 0) / weight,
        found.members.reduce((sum, m) => sum + m.chroma * Math.cos(m.hue), 0) / weight,
      );
    }
  }

  return candidates.map((ramp, id) => {
    const members = ramp.members.toSorted((a, b) => a.L - b.L);
    return {
      id,
      neutral: ramp.neutral,
      indexes: members.map((m) => m.index),
      // Position along the ramp, 0 at the darkest member and 1 at the lightest.
      positionOf: new Map(
        members.map((m, i) => [m.index, members.length > 1 ? i / (members.length - 1) : 0.5]),
      ),
      steps: Math.max(members.length - 1, 1),
    };
  });
}

/** Which ramp each palette index belongs to. */
export function rampIndex(ramps: Ramp[], paletteLength: number): Int32Array {
  const of = new Int32Array(paletteLength).fill(-1);
  for (const ramp of ramps) for (const index of ramp.indexes) of[index] = ramp.id;
  return of;
}

/**
 * How much of each ramp a frame uses, and where along it (D27).
 *
 * Measured on usage rather than on regions: how many cells sit on the ramp, and
 * how far along it they sit. A shirt that went a shade darker moves its ramp's
 * centre, and that shows here without anything having to know where the shirt
 * is. Deriving the regions from colour would make the check depend on the thing
 * it is checking.
 */
export function rampUsage(cells: Int16Array, ramps: Ramp[], rampOf: Int32Array): RampUsage[] {
  const usage = ramps.map(() => ({ count: 0, sum: 0 }));
  for (const index of cells) {
    if (index < 0) continue;
    const ramp = rampOf[index];
    if (ramp === undefined || ramp < 0) continue;
    const bucket = usage[ramp];
    if (bucket === undefined) continue;
    bucket.count++;
    bucket.sum += ramps[ramp]?.positionOf.get(index) ?? 0.5;
  }
  return usage.map((entry, id) => ({
    id,
    count: entry.count,
    centre: entry.count > 0 ? entry.sum / entry.count : null,
    steps: ramps[id]?.steps ?? 1,
  }));
}

/**
 * Ramp drift against the base pose, in shades.
 *
 * Only ramps the base pose actually uses are judged, and only where the frame
 * still uses enough cells for the mean to mean anything. One shade of movement
 * is a warning — a new pose lights a character differently — and two is a
 * refusal.
 */
export function rampDrift(
  baseUsage: RampUsage[],
  frameUsage: RampUsage[],
  { minCells = 12 } = {},
): { shades: number; ramp: number } {
  let worst = 0;
  let worstRamp = -1;
  for (const base of baseUsage) {
    if (base.centre === null || base.count < minCells) continue;
    const frame = frameUsage[base.id];
    if (frame === undefined || frame.centre === null || frame.count < minCells) continue;
    const shades = Math.abs(frame.centre - base.centre) * base.steps;
    if (shades > worst) {
      worst = shades;
      worstRamp = base.id;
    }
  }
  return { shades: worst, ramp: worstRamp };
}

export function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`;
}

export function fromHex(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (match?.[1] === undefined) return null;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}
