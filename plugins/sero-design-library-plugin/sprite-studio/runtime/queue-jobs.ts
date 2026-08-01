/**
 * The three jobs that make an animation.
 *
 * Free functions rather than methods, so that the queue file is about queueing
 * — concurrency, cancellation, what happens when a job throws — and this one is
 * about the work. They are handed a `JobRunner` for the few things only the
 * queue can do: resolve a provider, move a status, say what is happening.
 */

import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { AppRuntimeHost } from '@sero-ai/common';

import type { DesignLibraryPaths } from '../../shared/paths';
import { readState } from '../../shared/state-io';
import type { MediaProvider } from '../../runtime/media/contract';
import type { AnimationRecord, FrameRecord } from '../shared/character';
import { animationDir } from '../shared/paths';
import { buildAnimation, readBasePose, requestAnimationClip, toPlates } from './generation/animate';
import { proposeFrames } from './generation/propose';
import { repairFrame } from './generation/repair';
import { setOpen } from './projection';
import { openReviewWhenBatchLands, reviewIsOpen, settleReview } from './review';
import { clearStaged, readStaged } from './staging';
import {
  findAnimation,
  mutateAnimation,
  paletteOf,
  readAnimation,
  readCharacter,
  readFrame,
  writeFrame,
} from './store';

export interface FixJob {
  kind: 'fix';
  animationId: string;
  instruction: string;
  frameId?: string;
}

export interface AnimateJob {
  kind: 'animate';
  characterId: string;
  animationId: string;
}

/** Compile the samples and work out which of them to offer (spec §2.4). */
export interface ProposeJob {
  kind: 'propose';
  characterId: string;
  animationId: string;
  stagingKey: string;
  durationsMs: number[];
}

export interface BuildJob {
  kind: 'build';
  characterId: string;
  animationId: string;
  stagingKey: string;
  durationsMs: number[];
  /** The frames the user kept at the review. */
  chosen: number[];
}

/** What a job needs from the queue that runs it. */
export interface JobRunner {
  readonly paths: DesignLibraryPaths;
  readonly host: AppRuntimeHost;
  readonly workspaceId: string;
  readonly sessionId: string;
  provider(): Promise<MediaProvider>;
  progress(characterId: string, message: string, animationId?: string): Promise<void>;
  setStatus(
    characterId: string,
    animationId: string,
    status: 'generating' | 'proposing' | 'compiling' | 'judging',
    message: string,
  ): Promise<void>;
  changed(): Promise<void>;
}

/**
 * Fixing by AI, on a frame or on a whole animation (D18).
 *
 * The same action the automatic repair uses, run because the user asked. On
 * one frame it is a single-pose redraw; on an animation with no frame named it
 * is the worst frame the checks complain about, so "fix it" without saying
 * what is wrong still does something honest.
 */
export async function runFix(runner: JobRunner, job: FixJob, signal: AbortSignal): Promise<void> {
  const animation = await findAnimation(runner.paths, job.animationId);
  if (animation === null) return;
  const character = await readCharacter(runner.paths, animation.characterId);
  if (character === null) return;

  const target =
    job.frameId === undefined
      ? worstFrame(animation)
      : animation.frames.find((frame) => frame.id === job.frameId);
  if (target === undefined) {
    await runner.progress(
      animation.characterId,
      'Nothing in this animation is flagged, so say which frame to redraw.',
      animation.id,
    );
    return;
  }

  await runner.progress(animation.characterId, 'Redrawing the frame…', animation.id);
  const palette = paletteOf(character);
  const basePose = await readBasePose(runner.paths, character);
  const outcome = await repairFrame({
    provider: await runner.provider(),
    character,
    palette,
    frame: await readFrame(runner.paths, character, target),
    basePose,
    problem:
      target.findings.map((finding) => finding.message).join(' ') ||
      'The user is not happy with this frame.',
    instruction: job.instruction,
    scale: 0,
    model: (await readState(runner.paths)).sprite.settings.repairModel,
    directory: path.join(animationDir(runner.paths, character.id, animation.id), 'repairs'),
    signal,
    onProgress: (message) => void runner.progress(character.id, message, animation.id),
  });

  if (outcome.status !== 'repaired') {
    await runner.progress(character.id, `The redraw did not help: ${outcome.reason}`, animation.id);
    return;
  }

  // Appends rather than replaces, so the version the user disliked survives
  // and a repair that came back worse is recoverable (D18).
  const previous = animation.frames;
  const file = await writeFrame(runner.paths, character, animation.id, target.id, outcome.cells);
  await mutateAnimation(runner.paths, character.id, animation.id, (current) => ({
    ...current,
    history: [
      ...current.history,
      {
        id: randomUUID(),
        reason: job.instruction === '' ? 'Redrawn on request' : job.instruction,
        frames: previous,
        report: current.report,
        createdAt: Date.now(),
      },
    ],
    frames: current.frames.map((frame) =>
      frame.id === target.id
        ? {
            ...frame,
            file,
            findings: outcome.findings
              .filter((finding): finding is (typeof outcome.findings)[number] => finding.level === 'warn')
              .map(({ check, level, message }) => ({ check, level, message })),
            provenance: {
              ...frame.provenance,
              kind: 'pose' as const,
              repairs: frame.provenance.repairs + outcome.attempts,
              createdAt: Date.now(),
            },
          }
        : frame,
    ),
  }));
}


export async function runAnimate(runner: JobRunner, job: AnimateJob, signal: AbortSignal): Promise<void> {
  const character = await readCharacter(runner.paths, job.characterId);
  const animation = await readAnimation(runner.paths, job.characterId, job.animationId);
  if (character === null || animation === null) return;

  await runner.setStatus(job.characterId, job.animationId, 'generating', 'Drawing the movement…');
  const basePose = await readBasePose(runner.paths, character);
  const state = await readState(runner.paths);
  const outcome = await requestAnimationClip(
    character,
    animation,
    basePose,
    animation.videoModel ?? '',
    {
      host: runner.host,
      paths: runner.paths,
      provider: await runner.provider(),
      workspaceId: runner.workspaceId,
      parentSessionId: runner.sessionId,
      model: state.settings.designModel,
      resolution: state.sprite.settings.resolution,
      signal,
      onProgress: (message) => void runner.progress(job.characterId, message, job.animationId),
    },
  );

  if (outcome.status === 'failed') {
    const stopped = await mutateAnimation(runner.paths, job.characterId, job.animationId, (current) => ({
      ...current,
      status: 'failed',
      error: outcome.reason,
    }));
    // A clip that never arrived is still this animation landing, as far as the
    // batch is concerned. Its siblings' reviews must not wait on it.
    if (stopped !== null) await openReviewWhenBatchLands(runner.paths, stopped);
    return;
  }

  // The clip is here and the runtime cannot open it. The page picks this up,
  // decodes it and sends the frames back as a request.
  await mutateAnimation(runner.paths, job.characterId, job.animationId, (current) => ({
    ...current,
    status: 'awaiting-frames',
    clipFile: outcome.clipPath,
  }));
}

/**
 * Between the clip and the sequence: what would be kept, drawn for the user.
 *
 * Short, unattended and free. Nothing here calls a provider — the clip is paid
 * for and the samples are staged, so this is the cheapest gate in the feature.
 */
export async function runPropose(
  runner: JobRunner,
  job: ProposeJob,
  signal: AbortSignal,
): Promise<void> {
  const character = await readCharacter(runner.paths, job.characterId);
  const animation = await readAnimation(runner.paths, job.characterId, job.animationId);
  if (character === null || animation === null) return;

  await runner.setStatus(job.characterId, job.animationId, 'proposing', 'Reading the clip…');
  const sampled = await readSamples(runner, job.stagingKey, job.durationsMs);
  const proposal = await proposeFrames(
    runner.paths,
    character,
    animation,
    await readBasePose(runner.paths, character),
    toPlates(sampled),
  );
  if (signal.aborted) return;

  if ('failed' in proposal) {
    // The samples cannot be read, so nothing will ever be built from them and
    // holding them open would only be a review nobody can finish.
    await clearStaged(runner.paths, job.stagingKey);
    const stopped = await mutateAnimation(runner.paths, job.characterId, job.animationId, (current) => ({
      ...current,
      status: 'failed',
      error: proposal.failed,
    }));
    if (stopped !== null) await openReviewWhenBatchLands(runner.paths, stopped);
    return;
  }

  const updated = await mutateAnimation(runner.paths, job.characterId, job.animationId, (current) => ({
    ...current,
    status: 'awaiting-review',
    // Set now rather than at the build, so the review screen knows how big the
    // previews it is about to paint are.
    canvas: proposal.canvas,
    anchor: proposal.anchor,
    review: {
      stagingKey: job.stagingKey,
      sampleCount: proposal.sampleCount,
      sampleDurationsMs: sampled.map((frame) => frame.durationMs),
      proposed: proposal.proposed,
      ...(proposal.loopWindow === undefined ? {} : { loopWindow: proposal.loopWindow }),
      scale: proposal.scale,
      proposedAt: Date.now(),
    },
    error: undefined,
  }));

  await runner.changed();
  if (updated !== null) await openReviewWhenBatchLands(runner.paths, updated);
}

/** The staged samples, with the real time each of them held (D23). */
async function readSamples(
  runner: JobRunner,
  stagingKey: string,
  durationsMs: number[],
): Promise<{ bytes: Buffer; durationMs: number }[]> {
  const staged = await readStaged(runner.paths, stagingKey);
  return staged.map((file, index) => ({
    bytes: file.bytes,
    durationMs: durationsMs[index] ?? Math.round(1000 / 12),
  }));
}

export async function runBuild(runner: JobRunner, job: BuildJob, signal: AbortSignal): Promise<void> {
  const character = await readCharacter(runner.paths, job.characterId);
  const animation = await readAnimation(runner.paths, job.characterId, job.animationId);
  if (character === null || animation === null) return;

  await runner.setStatus(job.characterId, job.animationId, 'compiling', 'Cleaning the frames…');
  const sampled = await readSamples(runner, job.stagingKey, job.durationsMs);

  const state = await readState(runner.paths);
  const built = await buildAnimation(character, animation, await readBasePose(runner.paths, character), sampled, {
    host: runner.host,
    paths: runner.paths,
    provider: await runner.provider(),
    workspaceId: runner.workspaceId,
    parentSessionId: runner.sessionId,
    model: state.settings.designModel,
    repairModel: state.sprite.settings.repairModel,
    chosen: job.chosen,
    signal,
    onProgress: (message) => void runner.progress(job.characterId, message, job.animationId),
  });
  // The review is over either way: the samples have been read, and leaving them
  // on disk is ten megabytes an animation that nothing will ever open again.
  await settleReview(runner.paths, animation);

  if ('failed' in built) {
    await mutateAnimation(runner.paths, job.characterId, job.animationId, (current) => ({
      ...current,
      status: 'failed',
      error: built.failed,
    }));
    return;
  }

  // An animation with no frames is not ready, whatever the run reported. The
  // checkpoint would present an empty strip with an Approve button on it,
  // which is the failure that looks most like a success.
  if (built.frames.length === 0) {
    await mutateAnimation(runner.paths, job.characterId, job.animationId, (current) => ({
      ...current,
      status: 'failed',
      error: 'Nothing survived cleaning the clip, so there is no animation to show you.',
    }));
    return;
  }

  await mutateAnimation(runner.paths, job.characterId, job.animationId, (current) => ({
    ...current,
    status: 'ready',
    frames: built.frames,
    canvas: built.canvas,
    anchor: built.anchor,
    findings: [
      ...built.findings,
      ...(built.advice === '' ? [] : [{ check: 'loop', level: 'warn' as const, message: built.advice }]),
    ],
    report: built.report,
    plan: { ...current.plan, loop: built.loop },
    error: undefined,
  }));

  // Put it in front of the user. The whole shape of the feature is "it stops
  // after each animation for your approval", and an animation that finishes
  // behind the screen the user happens to be on has not stopped for anything
  // — the clip is paid for, the sequence is built, and nothing says so.
  //
  // Unless the user is still picking frames for the rest of the batch. Pulling
  // them off a review they are halfway through, to show them a checkpoint they
  // will reach anyway, loses the choice they were making.
  await runner.changed();
  if (!(await reviewIsOpen(runner.paths, animation))) {
    await setOpen(runner.paths, {
      characterId: job.characterId,
      animationId: job.animationId,
    });
  }
}


/**
 * The frame worth redrawing when the user said "fix it" and nothing else.
 *
 * The one the checks complain about most. When nothing is flagged there is no
 * honest answer, so nothing is chosen: redrawing whichever frame happened to be
 * first would spend a call to look busy.
 */
function worstFrame(animation: AnimationRecord): FrameRecord | undefined {
  const flagged = animation.frames.filter((frame) => frame.findings.length > 0);
  return flagged.toSorted((a, b) => b.findings.length - a.findings.length)[0];
}
