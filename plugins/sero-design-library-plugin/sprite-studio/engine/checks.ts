/**
 * The validation firewall (spec §2.3).
 *
 * The pixel source is noisy, so this is stricter than the original concept
 * needed rather than looser. Everything here is a measurement with a threshold:
 * a check that only printed a number would not have caught the knight arriving
 * inside a drawn white box, because the number was reported and the frame was
 * accepted anyway.
 *
 * Two rules run through all of it:
 *  - **Legal is not faithful** (D22, D27). Palette conformance proves a colour
 *    is on the list, not that the shirt is still the same green, so ramp drift
 *    is checked separately.
 *  - **Difference is measured at the best alignment** (D11), never where the
 *    frames happen to land.
 */

import { frameDifference } from './align';
import { rampDrift } from './colour';
import type { CompiledAnimation } from './compile';
import { loopClosure } from './loop';
import type { CellGrid, LoopMode, RampUsage } from './types';

export type CheckLevel = 'refuse' | 'warn';

export interface Finding {
  /** Stable id, so the UI can group and the runtime can say what it repaired. */
  check: string;
  level: CheckLevel;
  /** The frame it belongs to, or absent for a whole-sequence finding. */
  frame?: number;
  message: string;
}

export interface CheckLimits {
  /** The character's height in art pixels, from the approved character sheet. */
  artHeight: number;
  /**
   * How much **taller** than the character a frame's silhouette may be.
   *
   * Asymmetric, and the asymmetry is the whole point. A silhouette that is
   * taller than the character has something attached to him that is not him —
   * the knight came back inside a drawn white box measuring 205 art pixels
   * against his real 129 (D37). A silhouette that is *shorter* is a crouch, a
   * duck, a death or a jump with the legs thrown apart, and a jump we generated
   * and looked at spends half its frames there. A single symmetric tolerance
   * refuses every one of them and orders a repair on a perfectly good pose.
   */
  heightTolerance: number;
  /**
   * How short a frame's silhouette may be, as a share of the character.
   *
   * Below this the pose is not a crouch any more: something has been cut off,
   * or the character has fallen out of the frame.
   */
  shortestShare: number;
  /** Share of cells allowed to sit off the palette. */
  offPalette: number;
  /** Share of the drawn mass allowed to be detached from the body. */
  detached: number;
  /** Share of the silhouette allowed to change between neighbouring frames. */
  continuity: number;
  /** Share of still cells allowed to change — the boil limit. */
  churn: number;
  /** Isolated cells allowed before the quantiser is judged to have left litter. */
  orphans: number;
  /** How far a grounded frame's feet may sit from the baseline, in art pixels. */
  footSlack: number;
}

/**
 * Defaults measured across fifteen animations, five characters and three action
 * types. Every one of them is a number the wider test produced, not a guess —
 * see D37 for what each was measured at.
 */
export const DEFAULT_LIMITS: CheckLimits = {
  artHeight: 0,
  heightTolerance: 8,
  // A deep crouch on the jump we generated measures a little over half the
  // standing height, so anything above that is a pose rather than a fault.
  shortestShare: 0.5,
  offPalette: 0.05,
  detached: 0.02,
  // Between **neighbouring sampled frames**, an twelfth of a second apart. Not
  // between kept frames: thinning deliberately drops the frames in between, so
  // consecutive survivors are far apart in time and a jump legitimately changes
  // most of its silhouette between them. Judged there, this check refuses every
  // animation with real movement in it — which is the failure no repair path
  // can fix (D30).
  continuity: 0.55,
  churn: 0.03,
  orphans: 12,
  footSlack: 1.5,
};

/** Cells with no drawn neighbour — litter the quantiser left behind. */
export function countOrphans(frame: CellGrid): number {
  const { cols, rows, cells } = frame;
  let orphans = 0;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if ((cells[y * cols + x] ?? -1) < 0) continue;
      let neighbours = 0;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        const sx = x + dx;
        const sy = y + dy;
        if (sx < 0 || sy < 0 || sx >= cols || sy >= rows) continue;
        if ((cells[sy * cols + sx] ?? -1) >= 0) neighbours++;
      }
      if (neighbours === 0) orphans++;
    }
  return orphans;
}

function heightInArtPixels(animation: CompiledAnimation, frame: number): number {
  const silhouette = animation.frames[frame]?.silhouette;
  return silhouette === undefined ? 0 : silhouette.height / animation.scale;
}

/**
 * Every check, over a compiled animation.
 *
 * `declaredGrounded` is what the AI said when it planned the movement. It is
 * checked against the pixels rather than trusted: a jump whose "airborne" frames
 * never leave the baseline is refused, the same way a run that claims to have
 * written a file is refused today.
 */
export function checkAnimation(
  animation: CompiledAnimation,
  options: {
    limits?: Partial<CheckLimits> & Pick<CheckLimits, 'artHeight'>;
    loop: LoopMode;
    declaredGrounded?: boolean[];
    /** The base pose's ramp usage, for the fidelity comparison (D27). */
    baseRampUsage?: RampUsage[];
    /**
     * The join, measured on the frames the loop was cut from.
     *
     * Given rather than measured here whenever the sequence has been thinned.
     * Thinning drops the duplicate end frame, so the last frame that survives is
     * one step of the movement before the join — measuring closure on it reports
     * a normal step as a broken loop, and would condemn every good cycle we
     * found.
     */
    loopClosure?: number;
  },
): Finding[] {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const findings: Finding[] = [];
  const add = (check: string, level: CheckLevel, message: string, frame?: number): void => {
    findings.push({ check, level, message, ...(frame === undefined ? {} : { frame }) });
  };

  for (const [i, frame] of animation.frames.entries()) {
    // The one fault nothing downstream can repair, so it is checked at the point
    // where it can still be fixed: with more margin around the character.
    if (frame.silhouette.clipped) {
      add('framing', 'refuse', 'The drawing runs off the edge of the picture it came from, so part of the character is already missing. Regenerate it with more margin.', i);
    }

    if (frame.cells.cols !== animation.cols || frame.cells.rows !== animation.rows) {
      add('canvas', 'refuse', `This frame is ${frame.cells.cols} × ${frame.cells.rows}, not the animation's ${animation.cols} × ${animation.rows}.`, i);
    }

    if (frame.offPalette > limits.offPalette) {
      add('palette', 'refuse', `${(frame.offPalette * 100).toFixed(1)}% of this frame was drawn in colours the character's palette does not hold.`, i);
    }

    // This rejects the frame, it does not merely report a number — it is what
    // catches a drawn artefact touching the character. The knight is 129 art
    // pixels tall and came back inside a white box measuring 205.
    if (limits.artHeight > 0) {
      const height = heightInArtPixels(animation, i);
      if (height - limits.artHeight > limits.heightTolerance) {
        add('body-size', 'refuse', `The character measures ${height.toFixed(0)} art pixels here against ${limits.artHeight}. Something is being drawn as part of him that is not him.`, i);
      } else if (height < limits.artHeight * limits.shortestShare) {
        add('body-size', 'refuse', `Only ${height.toFixed(0)} art pixels of the character are here, against ${limits.artHeight}. Part of him is missing.`, i);
      }
    }

    if (frame.silhouette.detached > limits.detached) {
      add('detached', 'warn', `${(frame.silhouette.detached * 100).toFixed(0)}% of what was drawn is not joined to the character and was dropped.`, i);
    }

    const orphans = countOrphans(frame.cells);
    if (orphans > limits.orphans) {
      add('orphans', 'warn', `${orphans} stray cells sit on their own with nothing around them.`, i);
    }

    void frame;

    // Legal colours are not the right colours. One shade of movement is a
    // warning, because a new pose lights a character differently; two is a
    // refusal (D27).
    const usage = animation.rampUsage[i];
    if (options.baseRampUsage !== undefined && usage !== undefined) {
      const { shades } = rampDrift(options.baseRampUsage, usage);
      if (shades >= 2) {
        add('fidelity', 'refuse', `A whole material has moved ${shades.toFixed(1)} shades from the base pose. Every colour is legal and the character is not the same colour.`, i);
      } else if (shades >= 1) {
        add('fidelity', 'warn', `A material sits about a shade away from the base pose here.`, i);
      }
    }
  }

  // Ground contact: the declaration is evidence, never a fact.
  const declared = options.declaredGrounded;
  if (declared !== undefined) {
    const disagreed = declared.filter((claim, i) => claim !== animation.groundedFromPixels[i]).length;
    const airborneClaimed = declared.filter((claim) => !claim).length;
    const airborneSeen = animation.groundedFromPixels.filter((seen) => !seen).length;
    if (airborneClaimed > 0 && airborneSeen === 0) {
      add('root', 'refuse', `The plan says the feet leave the ground for ${airborneClaimed} frames, and in the pictures they never do.`);
    } else if (disagreed > Math.max(2, declared.length * 0.25)) {
      add('root', 'warn', `${disagreed} frames disagree with the plan about whether the feet are on the ground.`);
    }
  }

  for (const [i, frame] of animation.frames.entries()) {
    if (!frame.grounded) continue;
    if (Math.abs(frame.footHeight) > limits.footSlack) {
      add('root', 'refuse', `This frame is meant to be standing on the ground and its feet sit ${frame.footHeight.toFixed(1)} art pixels off it.`, i);
    }
  }

  if (animation.uncorrected) {
    add('root', 'warn', 'No frame in this animation touches the ground, so no drift correction was applied. The positions are exactly as the model drew them.');
  }

  if (animation.churn.withMemory > limits.churn) {
    add('churn', 'refuse', `${(animation.churn.withMemory * 100).toFixed(1)}% of the cells that should be still change between frames. The sprite boils.`);
  }

  // A ping-pong loop is exempt: it joins by construction, because both ends are
  // the same frame.
  if (options.loop === 'forward') {
    const closure =
      options.loopClosure ?? loopClosure(animation.frames.map((frame) => frame.cells));
    if (closure > 0.12) {
      add('loop', 'refuse', `The last frame does not return to the first: ${(closure * 100).toFixed(0)}% of the sprite differs across the join.`);
    }
  }

  return findings;
}

/**
 * Silhouette continuity, over the frames as they were sampled (§2.3).
 *
 * Run on the dense sample rather than on what survived thinning, and that is not
 * a detail. Neighbouring sampled frames are a twelfth of a second apart, where a
 * huge change means the model redrew the character; neighbouring *kept* frames
 * are as far apart as thinning decided, and a jump legitimately throws its legs
 * open between two of them. Judged in the wrong place, this check refuses every
 * animation with life in it and passes every stiff one — exactly backwards
 * (D30).
 *
 * The finding is attached to the nearest kept frame, so the strip can show it.
 */
export function checkContinuity(
  sampled: CellGrid[],
  keptIndexes: number[],
  { continuity = DEFAULT_LIMITS.continuity, isolation = 0.5 } = {},
): Finding[] {
  const findings: Finding[] = [];
  const steps: number[] = [];
  for (let i = 1; i < sampled.length; i++) {
    const previous = sampled[i - 1];
    const current = sampled[i];
    steps.push(
      previous && current ? frameDifference(previous, current, { silhouetteOnly: true }) : 0,
    );
  }

  // A large change is refused only when the movement did not carry on through
  // it.
  //
  // Measured on a real jump: the clip is still for most of its length and then
  // changes 49, 57, 55, 37 going up and 58, 74, 61 coming down. Every one of
  // those is enormous — against the clip's median of 5% — and every one of them
  // is a perfectly good frame, because the legs open in a twelfth of a second.
  //
  // What separates that from a model redrawing the character for one frame is
  // where the movement went. After a real movement, the frames on either side
  // of the change are far apart, because the character kept going. After a
  // redraw, they are nearly identical: the character left and came straight
  // back. Size alone cannot tell them apart, and neither can how big the
  // neighbouring steps are — a redraw has a large step on both sides of it by
  // construction.
  for (const [index, change] of steps.entries()) {
    const i = index + 1;
    const before = sampled[i - 1];
    const after = sampled[i + 1];
    const carriedOn =
      before !== undefined && after !== undefined
        ? frameDifference(before, after, { silhouetteOnly: true })
        : change;
    if (change <= continuity || carriedOn >= change * isolation) continue;
    const nearest = keptIndexes.reduce(
      (best, kept, position) =>
        Math.abs(kept - i) < Math.abs((keptIndexes[best] ?? 0) - i) ? position : best,
      0,
    );
    findings.push({
      check: 'continuity',
      level: 'refuse',
      frame: nearest,
      message: `${(change * 100).toFixed(0)}% of the silhouette changes between two frames a twelfth of a second apart. That is a redraw, not a movement.`,
    });
  }
  return findings;
}

export function refusals(findings: Finding[]): Finding[] {
  return findings.filter((finding) => finding.level === 'refuse');
}

/** The frames a repair has to be ordered for, worst first. */
export function framesToRepair(findings: Finding[]): number[] {
  const counts = new Map<number, number>();
  for (const finding of refusals(findings)) {
    if (finding.frame === undefined) continue;
    counts.set(finding.frame, (counts.get(finding.frame) ?? 0) + 1);
  }
  return [...counts.entries()].toSorted((a, b) => b[1] - a[1]).map(([frame]) => frame);
}
