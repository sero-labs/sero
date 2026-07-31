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
  checkAnimation,
  compileAnimation,
  loopAdvice,
  loopClosure,
  rampUsage,
  searchLoop,
  thin,
  type CompiledAnimation,
  type Finding,
  type LoopMode,
  type Palette,
  type SourcePlate,
} from '../../engine';
import type { AnimationReport, StoredFinding } from '../../shared/character';

export interface AssembleOptions {
  palette: Palette;
  /** Source pixels per art pixel, calibrated once for the whole sequence. */
  scale: number;
  /** The character's height in art pixels, for the body-size check. */
  artHeight: number;
  loop: LoopMode;
  /** How many frames to keep. The AI decides how many the action needs. */
  keep: number;
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

  const from = cut?.start ?? 0;
  const to = cut?.end ?? compiled.frames.length - 1;
  const window = compiled.frames.slice(from, to + 1);

  const kept = thin(
    window.map((frame) => frame.cells),
    window.map((frame) => frame.durationMs),
    {
      keep: options.keep,
      anchorCol: compiled.anchorCol,
      anchorRow: compiled.anchorRow,
      looping: mode !== 'once',
    },
  ).map((frame) => ({ index: from + frame.index, durationMs: frame.durationMs }));

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
      : cut !== null
        ? cut.cost
        : loopClosure(window.map((frame) => frame.cells));

  const findings = checkAnimation(survivors, {
    loop: mode,
    limits: { artHeight: options.artHeight },
    ...(closure === null ? {} : { loopClosure: closure }),
    ...(options.declaredGrounded === undefined
      ? {}
      : { declaredGrounded: kept.map((frame) => options.declaredGrounded?.[frame.index] ?? true) }),
    ...(options.baseRampUsage === undefined ? {} : { baseRampUsage: options.baseRampUsage }),
  });

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

export function storedFindings(findings: Finding[], frame?: number): StoredFinding[] {
  return findings
    .filter((finding) => finding.frame === frame)
    .map(({ check, level, message }) => ({ check, level, message }));
}
