/**
 * One animation, from a plate to a sequence the user can rule on.
 *
 * It runs in two halves, and the seam between them is not a design preference:
 * **the runtime has no codecs**. A clip finishes with nothing to compile from,
 * so the animation waits, the open page decodes it and hands the frames back,
 * and the second half runs. Nothing here polls for that; the frames arrive as a
 * request like everything else.
 *
 *   ask   → plate, clip, wait for frames
 *   build → compile, check, repair what refused, judge, present
 */

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { AppRuntimeHost } from '@sero-ai/common';

import type { DesignLibraryPaths } from '../../../shared/paths';
import { relativeToHome } from '../../../shared/paths';
import type { ModelSelection } from '../../../shared/settings';
import type { MediaProvider } from '../../../runtime/media/contract';
import { buildRamps, rampIndex, rampUsage } from '../../engine';
import type { CellGrid, Palette, RampUsage, SourcePlate } from '../../engine/types';
import type {
  AnimationRecord,
  CharacterRecord,
  FrameRecord,
  StoredFinding,
} from '../../shared/character';
import { animationDir, clipFile, plateFile } from '../../shared/paths';
import { toSourceImage } from '../image';
import { buildPlate, framePlate } from '../plate';
import { decodeIndexedPng } from '../png';
import { paletteOf, writeFrame } from '../store';
import { attemptFile, attemptProblem, requestClip } from '../video';
import { assemble, calibrateScale, storedFindings } from './assemble';
import { judgeFrame } from './judge';
import { repairFrame } from './repair';
import { buildMotionPrompt } from './prompt';
import { mkdir, writeFile } from 'node:fs/promises';

export interface AnimateContext {
  host: AppRuntimeHost;
  paths: DesignLibraryPaths;
  provider: MediaProvider;
  workspaceId: string;
  parentSessionId: string;
  model: ModelSelection;
  /** What the clip is drawn at. Defaults to 720p (D31). */
  resolution?: string;
  /** The endpoint a refused frame is redrawn with (D10). */
  repairModel?: string;
  signal: AbortSignal;
  onProgress?(message: string): void;
}

export type ClipOutcome =
  | { status: 'awaiting-frames'; clipPath: string; plateScale: number }
  | { status: 'failed'; reason: string };

/**
 * The first half: hand the model a plate and ask for a clip.
 *
 * The plate is built for the movement rather than for the character — an
 * animation that leaves the ground sits lower in the frame and is drawn smaller,
 * because a jump that runs off the top of the picture arrives already cut and
 * nothing downstream can put it back (D19).
 */
export async function requestAnimationClip(
  character: CharacterRecord,
  animation: AnimationRecord,
  basePose: CellGrid,
  videoModel: string,
  context: AnimateContext,
): Promise<ClipOutcome> {
  const palette = paletteOf(character);
  const plate = buildPlate(basePose, palette, {
    airborne: animation.plan.airborne !== undefined,
    footRow: character.root.footRow,
    centreCol: character.root.centreCol,
  });

  const directory = animationDir(context.paths, character.id, animation.id);
  await mkdir(directory, { recursive: true });
  const plateAt = plateFile(context.paths, character.id, animation.id);
  await writeFile(plateAt, plate.bytes);

  context.onProgress?.('Drawing the movement…');
  const attempt = await requestClip(context.provider, {
    model: videoModel,
    prompt: buildMotionPrompt(animation.plan, character),
    plate: { path: plateAt, bytes: plate.bytes },
    directory: path.dirname(clipFile(context.paths, character.id, animation.id, 'clip.mp4')),
    signal: context.signal,
    ...(context.resolution === undefined ? {} : { resolution: context.resolution }),
    ...(context.onProgress === undefined ? {} : { onProgress: context.onProgress }),
  });

  const problem = attemptProblem(attempt);
  if (problem !== null) return { status: 'failed', reason: problem };
  const file = attemptFile(
    attempt,
    path.dirname(clipFile(context.paths, character.id, animation.id, 'clip.mp4')),
  );
  if (file === null) return { status: 'failed', reason: 'The model returned no clip.' };

  return {
    status: 'awaiting-frames',
    clipPath: relativeToHome(context.paths, file),
    plateScale: plate.scale,
  };
}

export interface BuildResult {
  frames: FrameRecord[];
  canvas: { cols: number; rows: number };
  anchor: { col: number; row: number };
  findings: StoredFinding[];
  report: AnimationRecord['report'];
  loop: AnimationRecord['plan']['loop'];
  /** What to tell the user when a forward loop was asked for and none exists. */
  advice: string;
}

/**
 * The second half: sampled frames in, a finished sequence out.
 *
 * Everything the user is shown at the checkpoint is decided here — which frames
 * survive, what the report says, and which frames were redrawn and why. Repairs
 * happen before the checkpoint and are declared there rather than stopping the
 * run to ask, because in a batch of five that would stop constantly for a
 * decision the user has already delegated (D5).
 */
export async function buildAnimation(
  character: CharacterRecord,
  animation: AnimationRecord,
  basePose: CellGrid,
  sampled: { bytes: Buffer; durationMs: number }[],
  context: AnimateContext,
): Promise<BuildResult | { failed: string }> {
  const palette = paletteOf(character);
  const plates: SourcePlate[] = sampled.map((frame) => ({
    image: toSourceImage(frame.bytes),
    durationMs: frame.durationMs,
  }));
  if (plates.length === 0) return { failed: 'No frames came back from the clip.' };

  const first = plates[0]!.image;
  const platePlate = buildPlate(basePose, palette, {
    airborne: animation.plan.airborne !== undefined,
    footRow: character.root.footRow,
    centreCol: character.root.centreCol,
  });
  const { scale, source, measured } = calibrateScale(plates, {
    palette,
    expected: (first.width / platePlate.width) * platePlate.scale,
    artHeight: character.artHeight,
  });

  context.onProgress?.('Cleaning the frames…');
  const declared = declaredGrounded(animation, plates.length);
  const baseUsage = rampUsageOfBasePose(basePose, palette);
  const built = assemble(plates, {
    palette,
    scale,
    artHeight: character.artHeight,
    loop: animation.plan.loop,
    keep: animation.plan.frameCount,
    baseRampUsage: baseUsage,
    ...(declared === null ? {} : { declaredGrounded: declared }),
  });
  if (built === null) return { failed: 'Nothing in the clip could be read as the character.' };

  // Repairs, before the checkpoint. A frame that refuses on something a redraw
  // cannot fix — a drawing already cut off at the source edge — is left alone
  // and reported, because a second call would buy nothing.
  const cells: CellGrid[] = built.kept.map((frame) => built.compiled.frames[frame.index]!.cells);
  const repaired = new Map<number, number>();
  for (const [position, frame] of built.kept.entries()) {
    const refusals = built.findings.filter(
      (finding) => finding.frame === position && finding.level === 'refuse',
    );
    const fixable = refusals.filter((finding) => finding.check !== 'framing');
    if (fixable.length === 0) continue;
    if (context.signal.aborted) break;

    const outcome = await repairFrame({
      provider: context.provider,
      character,
      palette,
      frame: cells[position]!,
      basePose,
      problem: fixable.map((finding) => finding.message).join(' '),
      scale,
      ...(context.repairModel === undefined ? {} : { model: context.repairModel }),
      directory: path.join(animationDir(context.paths, character.id, animation.id), 'repairs'),
      signal: context.signal,
      ...(context.onProgress === undefined ? {} : { onProgress: context.onProgress }),
    });
    if (outcome.status === 'repaired') {
      cells[position] = outcome.cells;
      repaired.set(position, outcome.attempts);
    }
    void frame;
  }

  context.onProgress?.('Writing the frames…');
  const frames: FrameRecord[] = [];
  for (const [position, kept] of built.kept.entries()) {
    const compiled = built.compiled.frames[kept.index]!;
    const frameId = randomUUID();
    const file = await writeFrame(context.paths, character, animation.id, frameId, cells[position]!);
    frames.push({
      id: frameId,
      file,
      root: { x: built.anchor.col, y: built.anchor.row },
      grounded: compiled.grounded,
      durationMs: kept.durationMs,
      provenance: {
        model: animation.videoModel ?? '',
        kind: repaired.has(position) ? 'pose' : 'video',
        repairs: repaired.get(position) ?? 0,
        sampledIndex: kept.index,
        createdAt: Date.now(),
      },
      findings: storedFindings(built.findings, position),
    });
  }

  // The judge runs last and changes nothing. Its verdict is a warning on the
  // frame, and the user decides — a repair on the strength of an unproven judge
  // would be treating a suspicion by rewriting the evidence (D24, D30).
  const unjudged = await addIdentityWarnings(
    character,
    animation,
    basePose,
    cells,
    frames,
    context,
  );

  return {
    frames,
    canvas: built.canvas,
    anchor: built.anchor,
    findings: [
      ...storedFindings(built.findings, undefined),
      ...(unjudged === null ? [] : [unjudged]),
    ],
    report: { ...built.report, repairedFrames: [...repaired.keys()] },
    loop: built.loop.mode,
    // Both are facts the user should have at the checkpoint: the loop the clip
    // could or could not make, and whether the model framed the character
    // differently from the plate it was given.
    advice: [built.loop.advice, scaleNote(source, measured)].filter((line) => line !== '').join(' '),
  };
}

function scaleNote(source: 'plate' | 'measured', measured: number): string {
  return source === 'measured'
    ? `The model drew the character at a different size from the plate it was given, so the sprite was measured from the pictures instead — ${measured.toFixed(1)} source pixels per art pixel.`
    : '';
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

/**
 * Ask the judge about every frame, and say so when it could not answer.
 *
 * Returns a finding for the animation when the judge never managed a single
 * verdict. That case used to be indistinguishable from a clean sequence: the
 * judge failed on all six frames, added no warnings, and the checkpoint said
 * the identity check had passed. "Nothing found" and "nothing ran" have to look
 * different to the person deciding whether to approve.
 */
async function addIdentityWarnings(
  character: CharacterRecord,
  animation: AnimationRecord,
  basePose: CellGrid,
  cells: CellGrid[],
  frames: FrameRecord[],
  context: AnimateContext,
): Promise<StoredFinding | null> {
  const palette = paletteOf(character);
  const base = framePlate(basePose, palette, { scale: 8 });
  let judged = 0;
  let unavailable = '';
  for (const [position, frame] of frames.entries()) {
    if (context.signal.aborted) break;
    const current = cells[position];
    if (current === undefined) continue;
    context.onProgress?.(`Looking at frame ${position + 1} of ${frames.length}…`);
    const outcome = await judgeFrame(
      character,
      {
        animation: animation.plan.name,
        frameNumber: position + 1,
        frameCount: frames.length,
        images: {
          basePose: base.bytes,
          previous: position > 0 ? framePlate(cells[position - 1]!, palette, { scale: 8 }).bytes : null,
          frame: framePlate(current, palette, { scale: 8 }).bytes,
          next:
            position < cells.length - 1
              ? framePlate(cells[position + 1]!, palette, { scale: 8 }).bytes
              : null,
        },
      },
      {
        host: context.host,
        workspaceId: context.workspaceId,
        parentSessionId: context.parentSessionId,
        model: context.model,
        signal: context.signal,
      },
    );
    if (outcome.status === 'unavailable') {
      unavailable = outcome.reason;
      continue;
    }
    judged += 1;
    const { verdict } = outcome;
    if (!verdict.sameCharacter && verdict.note !== '') {
      frame.findings = [
        ...frame.findings,
        { check: 'identity', level: 'warn', message: verdict.note },
      ];
    }
  }

  if (judged > 0 || frames.length === 0) return null;
  return {
    check: 'identity',
    level: 'warn',
    message: `Nobody looked at these frames — the identity check could not run${
      unavailable === '' ? '' : `: ${unavailable}`
    }. The drawings are as measured; whether they are still the same character has not been decided.`,
  };
}

/** Read the base pose back off disk, ready to plate or compare against. */
export async function readBasePose(
  paths: DesignLibraryPaths,
  character: CharacterRecord,
): Promise<CellGrid> {
  const image = decodeIndexedPng(await readFile(path.join(paths.home, character.basePoseFile)));
  return { cols: image.width, rows: image.height, cells: image.cells };
}
