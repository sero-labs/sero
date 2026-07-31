/**
 * The root: the source holds the arc, and only the drift is corrected (D25).
 *
 * Taking the bottom of the silhouette as the anchor works for a standing
 * character and breaks everything else — a jump gets pinned to the ground for
 * its whole arc. The earlier answer, interpolating an airborne frame's *root*
 * between the grounded frames on either side, fails the same way: take-off and
 * landing are both on the ground, so the line between them is on the ground.
 *
 * The camera does not move. A frame in the middle of a jump therefore already
 * draws the character higher up the picture, and that height **is** the
 * animation. The position comes from the source and is never recomputed. What is
 * interpolated is the small **correction** that removes the video model's drift
 * — a quantity that is small and changes slowly, so interpolating it is safe.
 */

import type { Silhouette } from './types';

export interface RootCorrection {
  /** The one fixed reference point every frame is placed against, in source pixels. */
  reference: { x: number; y: number };
  /** Per frame: how far to move it to undo the model's drift. */
  corrections: { x: number; y: number }[];
  /** How many corrections were interpolated rather than measured. */
  interpolated: number;
  /**
   * True when no frame was on the ground, so no correction was applied at all.
   * Trusting the source is better than inventing a baseline that does not exist.
   */
  trusted: boolean;
}

function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * Which frames have their feet on the ground, measured from the pixels.
 *
 * The lowest foot position an animation reaches is its ground; anything close to
 * it is standing on it and anything well above it is in the air. The AI declares
 * this when it plans the animation and the runtime checks the declaration
 * against this answer — a structural claim from a model is evidence, never a
 * fact.
 */
export function detectGrounded(
  silhouettes: Silhouette[],
  scale: number,
  toleranceArtPixels = 2,
): boolean[] {
  const lowest = Math.max(...silhouettes.map((s) => s.footY));
  return silhouettes.map((s) => lowest - s.footY <= toleranceArtPixels * scale);
}

export function rootCorrections(
  silhouettes: Silhouette[],
  grounded: boolean[],
): RootCorrection {
  const anchors = silhouettes.filter((_, i) => grounded[i]);
  const source = anchors.length > 0 ? anchors : silhouettes;
  const reference = {
    y: median(source.map((s) => s.footY)),
    x: median(source.map((s) => s.footX)),
  };

  // An animation with no frame on the ground gets no correction at all, and says
  // so — a hover, a fall, anything that never touches down.
  if (anchors.length === 0) {
    return {
      reference,
      corrections: silhouettes.map(() => ({ x: 0, y: 0 })),
      interpolated: 0,
      trusted: true,
    };
  }

  const known = silhouettes.map((s, i) =>
    grounded[i] ? { x: s.footX - reference.x, y: s.footY - reference.y } : null,
  );

  let interpolated = 0;
  const corrections = known.map((value, i) => {
    if (value) return value;
    interpolated++;
    let before = -1;
    let after = -1;
    for (let j = i - 1; j >= 0; j--)
      if (known[j]) {
        before = j;
        break;
      }
    for (let j = i + 1; j < known.length; j++)
      if (known[j]) {
        after = j;
        break;
      }
    const from = before >= 0 ? known[before] : null;
    const to = after >= 0 ? known[after] : null;
    if (!from && !to) return { x: 0, y: 0 };
    if (!from) return { ...to! };
    if (!to) return { ...from };
    const t = (i - before) / (after - before);
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  });

  return { reference, corrections, interpolated, trusted: false };
}
