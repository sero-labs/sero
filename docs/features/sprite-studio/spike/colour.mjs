/**
 * Perceptual colour, and the ramps the fidelity check works on (D27).
 *
 * "One shade" has to mean what the eye thinks it means, so distances are
 * measured in OKLab rather than in sRGB.
 */

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** sRGB 0-255 to OKLab. */
export function oklab([r, g, b]) {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function labDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Group a palette into material ramps.
 *
 * A ramp is a set of entries that share a hue and differ in lightness — the
 * shades of the shirt, the shades of the leather. Grouping by hue direction and
 * chroma, then ordering by lightness, is enough: the check only needs to know
 * that two entries belong to the same material, not what the material is called.
 */
export function buildRamps(palette, { hueTolerance = 0.42 } = {}) {
  const entries = palette.map((rgb, index) => {
    const lab = oklab(rgb);
    const chroma = Math.hypot(lab[1], lab[2]);
    return { index, rgb, lab, chroma, hue: Math.atan2(lab[2], lab[1]), L: lab[0] };
  });

  const ramps = [];
  for (const entry of entries) {
    // Near-neutral colours have no meaningful hue, so they form their own ramp.
    const neutral = entry.chroma < 0.02;
    let found = ramps.find((ramp) => {
      if (ramp.neutral !== neutral) return false;
      if (neutral) return true;
      let delta = Math.abs(ramp.hue - entry.hue);
      if (delta > Math.PI) delta = 2 * Math.PI - delta;
      return delta < hueTolerance;
    });
    if (!found) {
      found = { neutral, hue: entry.hue, members: [] };
      ramps.push(found);
    }
    found.members.push(entry);
    if (!neutral) {
      // Keep the ramp's hue as the chroma-weighted mean of its members.
      const weight = found.members.reduce((sum, m) => sum + m.chroma, 0);
      found.hue = Math.atan2(
        found.members.reduce((s, m) => s + m.chroma * Math.sin(m.hue), 0) / weight,
        found.members.reduce((s, m) => s + m.chroma * Math.cos(m.hue), 0) / weight,
      );
    }
  }

  return ramps.map((ramp, id) => {
    const members = ramp.members.toSorted((a, b) => a.L - b.L);
    return {
      id,
      neutral: ramp.neutral,
      indexes: members.map((m) => m.index),
      // Position along the ramp, 0 at the darkest member and 1 at the lightest.
      positionOf: new Map(members.map((m, i) => [m.index, members.length > 1 ? i / (members.length - 1) : 0.5])),
      steps: Math.max(members.length - 1, 1),
    };
  });
}

/** Which ramp each palette index belongs to. */
export function rampIndex(ramps, paletteLength) {
  const of = new Int32Array(paletteLength).fill(-1);
  for (const ramp of ramps) for (const i of ramp.indexes) of[i] = ramp.id;
  return of;
}

/**
 * How far each ramp has moved since the base pose (D27).
 *
 * Measured on usage rather than on regions: how many cells sit on the ramp, and
 * how far along it they sit. A shirt that went a shade darker moves its ramp's
 * centre, and that shows here without anything having to know where the shirt is.
 */
export function rampUsage(cellIndexes, ramps, rampOf) {
  const usage = ramps.map(() => ({ count: 0, sum: 0 }));
  for (const index of cellIndexes) {
    if (index < 0) continue;
    const ramp = rampOf[index];
    if (ramp < 0) continue;
    usage[ramp].count++;
    usage[ramp].sum += ramps[ramp].positionOf.get(index) ?? 0.5;
  }
  return usage.map((u, id) => ({
    id,
    count: u.count,
    centre: u.count > 0 ? u.sum / u.count : null,
    steps: ramps[id].steps,
  }));
}

/**
 * Ramp drift against the base pose, in shades.
 *
 * Only ramps the base pose actually uses are judged, and only where the frame
 * still uses enough cells for the mean to mean anything.
 */
export function rampDrift(baseUsage, frameUsage, { minCells = 12 } = {}) {
  let worst = 0, worstRamp = -1;
  for (const base of baseUsage) {
    if (base.centre === null || base.count < minCells) continue;
    const frame = frameUsage[base.id];
    if (!frame || frame.centre === null || frame.count < minCells) continue;
    const shades = Math.abs(frame.centre - base.centre) * base.steps;
    if (shades > worst) { worst = shades; worstRamp = base.id; }
  }
  return { shades: worst, ramp: worstRamp };
}
