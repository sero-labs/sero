/**
 * Redrawing one frame (§5, §6.1).
 *
 * The automatic path and the user's path are the same action: a single-pose
 * draw holding the character, the palette, the canvas and the anchor, put
 * through the same validation as the original. The automatic one is just this,
 * run without being asked, up to twice.
 *
 * A repair **appends rather than replaces**, so the previous version survives —
 * the rule the Design Library already uses for revisions, and the reason a
 * repair that makes things worse is recoverable rather than final.
 */

import { compileAnimation, type CellGrid, type Finding, type Palette } from '../../engine';
import { checkAnimation } from '../../engine/checks';
import type { CharacterRecord } from '../../shared/character';
import type { MediaProvider } from '../../../runtime/media/contract';
import { toSourceImage } from '../image';
import { framePlate } from '../plate';
import { attemptFile, attemptProblem, requestPose } from '../video';
import { buildRepairPrompt } from './prompt';
import { readFile } from 'node:fs/promises';

/** Two attempts, then the sequence is presented with the frame as it stands. */
export const REPAIR_ATTEMPTS = 2;

export interface RepairRequest {
  provider: MediaProvider;
  character: CharacterRecord;
  palette: Palette;
  /** The frame as it stands. */
  frame: CellGrid;
  basePose: CellGrid;
  /** What the checks said, or what the user said. */
  problem: string;
  instruction?: string;
  /** The scale the sequence was compiled at, so the redraw measures the same. */
  scale: number;
  directory: string;
  signal: AbortSignal;
  onProgress?(message: string): void;
}

export type RepairOutcome =
  | { status: 'repaired'; cells: CellGrid; findings: Finding[]; attempts: number }
  | { status: 'unchanged'; reason: string; attempts: number };

/**
 * Ask for a redraw, and accept it only if it is better.
 *
 * "Better" is not a matter of opinion here: the redrawn frame goes through the
 * same checks, and a repair that refuses on more counts than the frame it
 * replaced is thrown away. Without that, two attempts at a bad frame can leave
 * the animation worse than one.
 */
export async function repairFrame(request: RepairRequest): Promise<RepairOutcome> {
  const before = framePlate(request.frame, request.palette, { scale: 8 });
  const reference = framePlate(request.basePose, request.palette, { scale: 8 });
  const prompt = buildRepairPrompt({
    character: request.character,
    problem: request.problem,
    ...(request.instruction === undefined ? {} : { instruction: request.instruction }),
  });

  let lastReason = 'The repair produced nothing.';
  for (let attempt = 1; attempt <= REPAIR_ATTEMPTS; attempt++) {
    if (request.signal.aborted) return { status: 'unchanged', reason: 'Cancelled.', attempts: attempt - 1 };
    request.onProgress?.(`Redrawing the frame (attempt ${attempt} of ${REPAIR_ATTEMPTS})…`);

    const outcome = await requestPose(request.provider, {
      plate: { path: 'frame.png', bytes: before.bytes },
      reference: { path: 'character.png', bytes: reference.bytes },
      prompt,
      directory: request.directory,
      signal: request.signal,
      ...(request.onProgress === undefined ? {} : { onProgress: request.onProgress }),
    });

    const problem = attemptProblem(outcome);
    if (problem !== null) {
      lastReason = problem;
      continue;
    }
    const file = attemptFile(outcome, request.directory);
    if (file === null) {
      lastReason = 'The model returned no picture.';
      continue;
    }

    // The redraw comes back at the model's own size, so it is measured the same
    // way a video frame is: keyed, resampled at the sequence's scale, quantised
    // onto the character's palette. A repair cannot introduce a colour the
    // character does not have, because there is nowhere for one to enter.
    const image = toSourceImage(await readFile(file));
    const compiled = compileAnimation([{ image, durationMs: 0 }], {
      palette: request.palette,
      scale: (image.width / before.width) * before.scale,
    });
    const redrawn = compiled?.frames[0];
    if (compiled === null || redrawn === undefined) {
      lastReason = 'Nothing could be read out of the redrawn frame.';
      continue;
    }

    const findings = checkAnimation(compiled, {
      loop: 'once',
      limits: { artHeight: request.character.artHeight },
    });
    const refusedNow = findings.filter((finding) => finding.level === 'refuse').length;
    if (refusedNow > 0) {
      lastReason = findings.find((finding) => finding.level === 'refuse')?.message ?? lastReason;
      continue;
    }

    return { status: 'repaired', cells: redrawn.cells, findings, attempts: attempt };
  }

  return { status: 'unchanged', reason: lastReason, attempts: REPAIR_ATTEMPTS };
}
