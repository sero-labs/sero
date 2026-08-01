/**
 * Sampled frames in, a finished animation out.
 *
 * This is where the deterministic engine meets the noisy source, and where the
 * firewall stands: compile, check, refuse. Nothing here asks a model anything —
 * the AI directs the work and judges the result, and this is the part that
 * decides whether what came back is usable at all.
 *
 * The order matters and is the order the specification gives: compile the whole
 * sequence (§2.4), cut the loop if one was asked for and one exists (D32/D34),
 * thin to the frames that carry the movement (D23), then check what survived.
 */

import {
  buildRamps,
  checkAnimation,
  checkContinuity,
  compileAnimation,
  handPickedDurations,
  loopAdvice,
  loopClosure,
  rampIndex,
  rampUsage,
  searchLoop,
  thin,
  type CellGrid,
  type CompiledAnimation,
  type Finding,
  type LoopMode,
  type Palette,
  type RampUsage,
  type SourcePlate,
} from '../../engine';
import type {
  AnimationReport,
  AnimationRecord,
  CharacterRecord,
  StoredFinding,
} from '../../shared/character';
import { buildPlate } from '../plate';
import { paletteOf } from '../store';

export interface AssembleOptions {
  palette: Palette;
  /** Source pixels per art pixel, calibrated once for the whole sequence. */
  scale: number;
  /** The character's height in art pixels, for the body-size check. */
  artHeight: number;
  loop: LoopMode;
  /**
   * The frames the user picked at the review, as indices into the sample.
   *
   * When it is present the selector does not run and the loop is not re-cut:
   * the user has already watched the whole clip and said which moments of it
   * are the animation. Absent, the selector proposes and this is what it
   * proposed from.
   */
  chosen?: number[];
  /** Which frames the plan says the feet are off the ground for (D21). */
  declaredGrounded?: boolean[];
  /** The base pose's ramp usage, so fidelity is judged against the character. */
  baseRampUsage?: ReturnType<typeof rampUsage>;
}

export interface AssembledAnimation {
  compiled: CompiledAnimation;
  /** The frames that survived thinning, in order, with their real durations. */
  kept: { index: number; durationMs: number }[];
  canvas: { cols: number; rows: number };
  anchor: { col: number; row: number };
  findings: Finding[];
  report: AnimationReport;
  /** What the loop search found, whatever mode was asked for. */
  loop: { mode: LoopMode; advice: string; cut?: { start: number; end: number } };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * The scale for this clip, calibrated once (D12).
 *
 * The plate is square and the clip comes back at the endpoint's own aspect
 * ratio, so the geometric answer — the plate's scale, in proportion to the
 * frame's width — is a guess about how the model framed it. Where the guess and
 * the character's measured height disagree badly, the measurement wins and says
 * so: a scale that is wrong by a fifth makes every size check meaningless, and
 * the sprite comes out the wrong size with nothing to explain it.
 *
 * Calibrated **once for the sequence**, never per frame. A model that draws the
 * character bigger in one frame must still show up as a bigger sprite, because
 * that is the drift being measured.
 */
export function calibrateScale(
  plates: SourcePlate[],
  options: { palette: Palette; expected: number; artHeight: number },
): { scale: number; source: 'plate' | 'measured'; measured: number } {
  const sample = plates.slice(0, Math.min(plates.length, 12));
  const heights: number[] = [];
  for (const plate of sample) {
    const compiled = compileAnimation([plate], {
      palette: options.palette,
      scale: options.expected,
    });
    const silhouette = compiled?.frames[0]?.silhouette;
    if (silhouette !== undefined) heights.push(silhouette.height);
  }
  const measured = options.artHeight > 0 ? median(heights) / options.artHeight : options.expected;
  if (measured <= 0) return { scale: options.expected, source: 'plate', measured: options.expected };
  const disagreement = Math.abs(measured - options.expected) / options.expected;
  return disagreement > 0.15
    ? { scale: measured, source: 'measured', measured }
    : { scale: options.expected, source: 'plate', measured };
}

export function assemble(
  plates: SourcePlate[],
  options: AssembleOptions,
): AssembledAnimation | null {
  const compiled = compileAnimation(plates, {
    palette: options.palette,
    scale: options.scale,
    ...(options.declaredGrounded === undefined ? {} : { grounded: options.declaredGrounded }),
  });
  if (compiled === null) return null;

  const cells = compiled.frames.map((frame) => frame.cells);

  // A forward loop is offered only when a real cycle is found. Where none
  // exists the tool says so and offers the three real answers, rather than
  // quietly shipping a walk that jerks every cycle (D34).
  const search = options.loop === 'forward' ? searchLoop(cells) : null;
  const cut = search?.verdict === 'forward' && search.best !== null ? search.best : null;
  const mode: LoopMode =
    options.loop === 'forward' && cut === null ? 'once' : options.loop;

  // A hand-picked set is taken over the whole clip: cutting the loop under it
  // would drop frames the user had just chosen, from a strip they chose them on.
  const picked = options.chosen;
  const from = picked === undefined ? (cut?.start ?? 0) : 0;
  const to = picked === undefined ? (cut?.end ?? compiled.frames.length - 1) : compiled.frames.length - 1;
  const window = compiled.frames.slice(from, to + 1);

  const selected =
    picked === undefined
      ? thin(
          window.map((frame) => frame.cells),
          window.map((frame) => frame.durationMs),
          {
            anchorCol: compiled.anchorCol,
            anchorRow: compiled.anchorRow,
            looping: mode !== 'once',
          },
        )
      : // The same call the review screen makes, so the sequence plays at the
        // speed the user watched it at before pressing the button.
        handPickedDurations(
          picked,
          window.map((frame) => frame.durationMs),
          mode,
        );
  const kept = selected.map((frame) => ({ index: from + frame.index, durationMs: frame.durationMs }));
  if (kept.length === 0) return null;

  // Checked on what survived, not on the dense sample: the frames the user is
  // shown are the frames the report is about.
  const survivors: CompiledAnimation = {
    ...compiled,
    frames: kept.map((frame) => compiled.frames[frame.index]!),
    rampUsage: kept.map((frame) => compiled.rampUsage[frame.index] ?? []),
  };

  // The join is the two frames the cut was made between — the moment the clip
  // returns to a pose it held — not the first and last frame that survived
  // thinning, which are a step of the movement apart by construction.
  const closure =
    mode !== 'forward'
      ? null
      : picked !== undefined
        ? // Across what the user kept, because that is the join they will see.
          loopClosure(kept.map((frame) => compiled.frames[frame.index]!.cells))
        : cut !== null
          ? cut.cost
          : loopClosure(window.map((frame) => frame.cells));

  // Continuity is measured over the sample, before thinning took the frames in
  // between away. Every other check is about the frames the user will see.
  const continuity = checkContinuity(
    window.map((frame) => frame.cells),
    kept.map((frame) => frame.index - from),
  );

  const findings = checkAnimation(survivors, {
    loop: mode,
    limits: { artHeight: options.artHeight },
    ...(closure === null ? {} : { loopClosure: closure }),
    ...(options.declaredGrounded === undefined
      ? {}
      : { declaredGrounded: kept.map((frame) => options.declaredGrounded?.[frame.index] ?? true) }),
    ...(options.baseRampUsage === undefined ? {} : { baseRampUsage: options.baseRampUsage }),
  }).concat(continuity);

  const footHeights = survivors.frames.map((frame) => frame.footHeight);
  const heights = survivors.frames.map((frame) => frame.silhouette.height / compiled.scale);
  const report: AnimationReport = {
    sampledFrames: plates.length,
    keptFrames: kept.length,
    offPalette: Math.max(0, ...survivors.frames.map((frame) => frame.offPalette)),
    churn: compiled.churn.withMemory,
    churnWithoutMemory: compiled.churn.withoutMemory,
    drift: Math.max(
      0,
      ...survivors.frames.map((frame) => Math.abs(frame.offset.dx) + Math.abs(frame.offset.dy)),
    ),
    loopClosure: closure,
    loopCandidate:
      search?.best == null
        ? null
        : { start: search.best.start, end: search.best.end, cost: search.best.cost },
    grounded: survivors.frames.filter((frame) => frame.grounded).length,
    footTravel: footHeights.length === 0 ? 0 : Math.max(...footHeights) - Math.min(...footHeights),
    heightSpread: heights.length === 0 ? 0 : Math.max(...heights) - Math.min(...heights),
    repairedFrames: [],
    uncorrected: compiled.uncorrected,
  };

  return {
    compiled,
    kept,
    canvas: { cols: compiled.cols, rows: compiled.rows },
    anchor: { col: compiled.anchorCol, row: compiled.anchorRow },
    findings,
    report,
    loop: {
      mode,
      advice: search === null || search.verdict === 'forward' ? '' : loopAdvice(search),
      ...(cut === null ? {} : { cut: { start: cut.start, end: cut.end } }),
    },
  };
}

export interface CompiledSequence {
  built: AssembledAnimation;
  /** Source pixels per art pixel, as it was settled for this clip. */
  scale: number;
  /** Said out loud when the model framed the character differently from the plate. */
  note: string;
}

/**
 * Sampled bytes to an assembled sequence, in one place.
 *
 * Both the proposal and the build come through here, which is the whole point:
 * the frames offered at the review are the frames the build would have picked,
 * produced by the same code rather than by a second copy of it that can drift.
 * The only difference between the two calls is `chosen`.
 */
export function compileSequence(
  character: CharacterRecord,
  animation: AnimationRecord,
  basePose: CellGrid,
  plates: SourcePlate[],
  chosen?: number[],
): CompiledSequence | { failed: string } {
  const palette = paletteOf(character);
  const first = plates[0]?.image;
  if (first === undefined) return { failed: 'No frames came back from the clip.' };

  const plate = buildPlate(basePose, palette, {
    airborne: animation.plan.airborne !== undefined,
    footRow: character.root.footRow,
    centreCol: character.root.centreCol,
  });
  const { scale, source, measured } = calibrateScale(plates, {
    palette,
    expected: (first.width / plate.width) * plate.scale,
    artHeight: character.artHeight,
  });

  const declared = declaredGrounded(animation, plates.length);
  const built = assemble(plates, {
    palette,
    scale,
    artHeight: character.artHeight,
    loop: animation.plan.loop,
    baseRampUsage: rampUsageOfBasePose(basePose, palette),
    ...(chosen === undefined ? {} : { chosen }),
    ...(declared === null ? {} : { declaredGrounded: declared }),
  });
  if (built === null) return { failed: 'Nothing in the clip could be read as the character.' };

  return {
    built,
    scale,
    note:
      source === 'measured'
        ? `The model drew the character at a different size from the plate it was given, so the sprite was measured from the pictures instead — ${measured.toFixed(1)} source pixels per art pixel.`
        : '',
  };
}

/** The plan's airborne range, spread over the sampled frames. */
function declaredGrounded(animation: AnimationRecord, sampled: number): boolean[] | null {
  const airborne = animation.plan.airborne;
  if (airborne === undefined) return null;
  const planned = Math.max(animation.plan.frameCount, 1);
  return Array.from({ length: sampled }, (_, index) => {
    // The plan counts in the frames it asked for; the clip arrives in sixty.
    const asPlanned = Math.floor((index / sampled) * planned) + 1;
    return asPlanned < airborne.from || asPlanned > airborne.to;
  });
}

/** The base pose's ramp usage: what every frame's colour is compared against. */
function rampUsageOfBasePose(basePose: CellGrid, palette: Palette): RampUsage[] {
  const ramps = buildRamps(palette);
  return rampUsage(basePose.cells, ramps, rampIndex(ramps, palette.length));
}

export function storedFindings(findings: Finding[], frame?: number): StoredFinding[] {
  return findings
    .filter((finding) => finding.frame === frame)
    .map(({ check, level, message }) => ({ check, level, message }));
}
