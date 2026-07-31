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
  /** How far a frame's silhouette may sit from that height, in art pixels. */
  heightTolerance: number;
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
  offPalette: 0.05,
  detached: 0.02,
  continuity: 0.45,
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
      const off = Math.abs(height - limits.artHeight);
      if (off > limits.heightTolerance) {
        add('body-size', 'refuse', `The character measures ${height.toFixed(0)} art pixels here against ${limits.artHeight}. Something is being drawn as part of him that is not him.`, i);
      }
    }

    if (frame.silhouette.detached > limits.detached) {
      add('detached', 'warn', `${(frame.silhouette.detached * 100).toFixed(0)}% of what was drawn is not joined to the character and was dropped.`, i);
    }

    const orphans = countOrphans(frame.cells);
    if (orphans > limits.orphans) {
      add('orphans', 'warn', `${orphans} stray cells sit on their own with nothing around them.`, i);
    }

    const previous = animation.frames[i - 1];
    if (previous !== undefined) {
      const change = frameDifference(previous.cells, frame.cells, { silhouetteOnly: true });
      if (change > limits.continuity) {
        add('continuity', 'refuse', `${(change * 100).toFixed(0)}% of the silhouette changes between frames ${i} and ${i + 1}, measured at the best alignment. That is a redraw, not a movement.`, i);
      }
    }

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
    const closure = loopClosure(animation.frames.map((frame) => frame.cells));
    if (closure > 0.12) {
      add('loop', 'refuse', `The last frame does not return to the first: ${(closure * 100).toFixed(0)}% of the sprite differs across the join.`);
    }
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
