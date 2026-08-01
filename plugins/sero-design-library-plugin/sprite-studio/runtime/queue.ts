/**
 * Everything that costs money or takes minutes.
 *
 * Three at once (D-settings): enough to keep a batch of five moving, low enough
 * that a mistake costs three clips rather than five. Video generation is real
 * money — about three dollars a clip at 1080p, far less at 720p — so the cap is
 * a spending control as much as a concurrency one, and a run that is cancelled
 * releases its slot without starting the next call.
 *
 * Nothing here polls. Work is queued when a request lands, and the second half
 * of an animation is queued when the page hands its frames back.
 */

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { AppRuntimeHost } from '@sero-ai/common';

import type { DesignLibraryPaths } from '../../shared/paths';
import { readState, updateState } from '../../shared/state-io';
import type { DesignLibraryState } from '../../shared/types';
import type { MediaProvider } from '../../runtime/media/contract';
import { createMediaProviderForRun } from '../../runtime/media/provider';
import type { AnimationRecord, FrameRecord } from '../shared/character';
import { animationDir } from '../shared/paths';
import type { SpriteExportOptions } from '../shared/state';
import { buildAnimation, readBasePose, requestAnimationClip } from './generation/animate';
import { runPlan } from './generation/plan';
import { buildCharacterPrompt } from './generation/prompt';
import { repairFrame } from './generation/repair';
import { exportCharacter } from './export';
import { ingestCharacter } from './ingest';
import { clearStaged, readStaged, stagingRoot } from './staging';
import {
  findAnimation,
  mutateAnimation,
  paletteOf,
  readAnimation,
  readCharacter,
  readFrame,
  writeFrame,
} from './store';
import { attemptFile, attemptProblem, requestCharacterImage } from './video';

export interface SpriteQueueContext {
  host: AppRuntimeHost;
  paths: DesignLibraryPaths;
  workspaceId: string;
  /** The open workspace, so a workspace export cannot write outside it. */
  workspacePath?: string;
  sessionId: string;
  onError(message: string, error: unknown): void;
  /** Called after any record change, so the projection stays honest. */
  onChanged(): Promise<void>;
  /** Test seam; defaults to the shipped fal adapter, as the Library does. */
  createProvider?: (
    paths: DesignLibraryPaths,
    settings: DesignLibraryState['settings']['media'],
  ) => Promise<MediaProvider>;
}

type Job =
  | { kind: 'plan'; characterId: string; planId: string; request: string; videoModel: string }
  | { kind: 'animate'; characterId: string; animationId: string }
  | {
      kind: 'build';
      characterId: string;
      animationId: string;
      stagingKey: string;
      durationsMs: number[];
    }
  | { kind: 'fix'; animationId: string; instruction: string; frameId?: string }
  | { kind: 'draw-character'; characterId: string; name: string; description: string }
  | {
      kind: 'export';
      exportId: string;
      characterId: string;
      animationIds: string[];
      options: SpriteExportOptions;
    };

export class SpriteQueue {
  private readonly waiting: Job[] = [];
  private readonly running = new Map<string, AbortController>();
  private readonly shutdown = new AbortController();
  private draining = false;

  constructor(private readonly context: SpriteQueueContext) {}

  plan(characterId: string, planId: string, request: string, videoModel: string): void {
    this.push({ kind: 'plan', characterId, planId, request, videoModel });
  }

  animate(characterId: string, animationId: string): void {
    this.push({ kind: 'animate', characterId, animationId });
  }

  build(characterId: string, animationId: string, stagingKey: string, durationsMs: number[]): void {
    this.push({ kind: 'build', characterId, animationId, stagingKey, durationsMs });
  }

  fix(animationId: string, instruction: string, frameId?: string): void {
    this.push({ kind: 'fix', animationId, instruction, ...(frameId === undefined ? {} : { frameId }) });
  }

  drawCharacter(characterId: string, name: string, description: string): void {
    this.push({ kind: 'draw-character', characterId, name, description });
  }

  exportSheet(
    exportId: string,
    characterId: string,
    animationIds: string[],
    options: SpriteExportOptions,
  ): void {
    this.push({ kind: 'export', exportId, characterId, animationIds, options });
  }

  cancelAnimation(animationId: string): void {
    this.running.get(animationId)?.abort();
    this.running.delete(animationId);
    const at = this.waiting.findIndex((job) => 'animationId' in job && job.animationId === animationId);
    if (at >= 0) this.waiting.splice(at, 1);
  }

  cancelCharacter(characterId: string): void {
    for (const [key, controller] of this.running) {
      if (key.startsWith(characterId)) controller.abort();
    }
  }

  async dispose(): Promise<void> {
    this.shutdown.abort();
    for (const controller of this.running.values()) controller.abort();
    this.running.clear();
  }

  private push(job: Job): void {
    this.waiting.push(job);
    void this.drain();
  }

  private async concurrency(): Promise<number> {
    const state = await readState(this.context.paths);
    return Math.max(1, Math.min(5, state.sprite.settings.concurrency));
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      const limit = await this.concurrency();
      while (this.waiting.length > 0 && this.running.size < limit) {
        const job = this.waiting.shift();
        if (job === undefined) break;
        void this.run(job);
      }
    } finally {
      this.draining = false;
    }
  }

  /**
   * What a running job is cancelled by.
   *
   * An animation is keyed by its own id, so cancelling it reaches the clip it is
   * waiting on. Everything else is keyed under its character, so purging a
   * character stops the work that belongs to it.
   */
  private keyOf(job: Job): string {
    if ('animationId' in job) return job.animationId;
    return `${job.characterId}:${job.kind}`;
  }

  private async run(job: Job): Promise<void> {
    const key = this.keyOf(job);
    const controller = new AbortController();
    this.running.set(key, controller);
    const onAbort = (): void => controller.abort();
    this.shutdown.signal.addEventListener('abort', onAbort, { once: true });

    try {
      await this.execute(job, controller.signal);
    } catch (error) {
      // One failed job must not stall the queue, and the user has to be told
      // something they can act on rather than finding a run that stopped.
      this.context.onError(`Sprite Studio job ${job.kind} failed`, error);
      await this.fail(job, error);
    } finally {
      this.shutdown.signal.removeEventListener('abort', onAbort);
      this.running.delete(key);
      await this.context.onChanged();
      void this.drain();
    }
  }

  private async provider(): Promise<MediaProvider> {
    const state = await readState(this.context.paths);
    const create = this.context.createProvider ?? createMediaProviderForRun;
    return create(this.context.paths, state.settings.media);
  }

  private async execute(job: Job, signal: AbortSignal): Promise<void> {
    switch (job.kind) {
      case 'plan':
        return this.executePlan(job, signal);
      case 'animate':
        return this.executeAnimate(job, signal);
      case 'build':
        return this.executeBuild(job, signal);
      case 'fix':
        return this.executeFix(job, signal);
      case 'draw-character':
        return this.executeDrawCharacter(job, signal);
      case 'export':
        return this.executeExport(job);
    }
  }

  /**
   * Fixing by AI, on a frame or on a whole animation (D18).
   *
   * The same action the automatic repair uses, run because the user asked. On
   * one frame it is a single-pose redraw; on an animation with no frame named it
   * is the worst frame the checks complain about, so "fix it" without saying
   * what is wrong still does something honest.
   */
  private async executeFix(job: Extract<Job, { kind: 'fix' }>, signal: AbortSignal): Promise<void> {
    const animation = await findAnimation(this.context.paths, job.animationId);
    if (animation === null) return;
    const character = await readCharacter(this.context.paths, animation.characterId);
    if (character === null) return;

    const target =
      job.frameId === undefined
        ? worstFrame(animation)
        : animation.frames.find((frame) => frame.id === job.frameId);
    if (target === undefined) {
      await this.progress(
        animation.characterId,
        'Nothing in this animation is flagged, so say which frame to redraw.',
        animation.id,
      );
      return;
    }

    await this.progress(animation.characterId, 'Redrawing the frame…', animation.id);
    const palette = paletteOf(character);
    const basePose = await readBasePose(this.context.paths, character);
    const outcome = await repairFrame({
      provider: await this.provider(),
      character,
      palette,
      frame: await readFrame(this.context.paths, character, target),
      basePose,
      problem:
        target.findings.map((finding) => finding.message).join(' ') ||
        'The user is not happy with this frame.',
      instruction: job.instruction,
      scale: 0,
      directory: path.join(animationDir(this.context.paths, character.id, animation.id), 'repairs'),
      signal,
      onProgress: (message) => void this.progress(character.id, message, animation.id),
    });

    if (outcome.status !== 'repaired') {
      await this.progress(character.id, `The redraw did not help: ${outcome.reason}`, animation.id);
      return;
    }

    // Appends rather than replaces, so the version the user disliked survives
    // and a repair that came back worse is recoverable (D18).
    const previous = animation.frames;
    const file = await writeFrame(this.context.paths, character, animation.id, target.id, outcome.cells);
    await mutateAnimation(this.context.paths, character.id, animation.id, (current) => ({
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

  /**
   * A character from words alone: an image model draws the base pose, and the
   * same ingestion runs on the result (spec §2.1).
   */
  private async executeDrawCharacter(
    job: Extract<Job, { kind: 'draw-character' }>,
    signal: AbortSignal,
  ): Promise<void> {
    // Beside the characters, not among them: the character scan walks that
    // directory, and anything in it that is not a character breaks the scan.
    const directory = path.join(stagingRoot(this.context.paths), 'drafts', job.characterId);
    const attempt = await requestCharacterImage(await this.provider(), {
      prompt: buildCharacterPrompt(job.description),
      directory,
      signal,
      onProgress: (message) => void this.progress(job.characterId, message),
    });

    const problem = attemptProblem(attempt);
    const file = attemptFile(attempt, directory);
    if (problem !== null || file === null) {
      this.context.onError(
        'Could not draw the character',
        new Error(problem ?? 'The model returned no picture.'),
      );
      return;
    }

    await ingestCharacter(this.context.paths, {
      characterId: job.characterId,
      name: job.name,
      source: 'text',
      bytes: await readFile(file),
      fileName: 'drawn.png',
    });
  }

  private async executeExport(job: Extract<Job, { kind: 'export' }>): Promise<void> {
    const result = await exportCharacter(
      this.context.paths,
      {
        exportId: job.exportId,
        characterId: job.characterId,
        animationIds: job.animationIds,
        options: job.options,
      },
      this.context.workspacePath === undefined ? {} : { workspacePath: this.context.workspacePath },
    );
    await this.progress(
      job.characterId,
      `Exported ${result.frames} frames to ${result.sheetFile} at ${result.scale}× (${result.spriteHeight} px tall).`,
    );
  }

  private async executePlan(
    job: Extract<Job, { kind: 'plan' }>,
    signal: AbortSignal,
  ): Promise<void> {
    const character = await readCharacter(this.context.paths, job.characterId);
    if (character === null) return;
    const state = await readState(this.context.paths);

    const outcome = await runPlan(character, job.request, job.videoModel, {
      host: this.context.host,
      workspaceId: this.context.workspaceId,
      parentSessionId: this.context.sessionId,
      model: state.settings.designModel,
      signal,
      onProgress: (message) => void this.progress(job.characterId, message),
    });

    // The plan is written into state for the dialog to show. Nothing is
    // generated from it until the user accepts it, which is the whole reason
    // planning is a step of its own.
    await updateState(this.context.paths, (current: DesignLibraryState) => ({
      ...current,
      sprite: {
        ...current.sprite,
        plans: {
          ...current.sprite.plans,
          [job.planId]:
            outcome.status === 'ok'
              ? { status: 'ok', animations: outcome.animations }
              : {
                  status: outcome.status,
                  reason: outcome.status === 'failed' ? outcome.reason : 'Cancelled.',
                },
        },
      },
    }));
  }

  private async executeAnimate(
    job: Extract<Job, { kind: 'animate' }>,
    signal: AbortSignal,
  ): Promise<void> {
    const character = await readCharacter(this.context.paths, job.characterId);
    const animation = await readAnimation(this.context.paths, job.characterId, job.animationId);
    if (character === null || animation === null) return;

    await this.setStatus(job.characterId, job.animationId, 'generating', 'Drawing the movement…');
    const basePose = await readBasePose(this.context.paths, character);
    const outcome = await requestAnimationClip(
      character,
      animation,
      basePose,
      animation.videoModel ?? '',
      {
        host: this.context.host,
        paths: this.context.paths,
        provider: await this.provider(),
        workspaceId: this.context.workspaceId,
        parentSessionId: this.context.sessionId,
        model: (await readState(this.context.paths)).settings.designModel,
        signal,
        onProgress: (message) => void this.progress(job.characterId, message, job.animationId),
      },
    );

    if (outcome.status === 'failed') {
      await mutateAnimation(this.context.paths, job.characterId, job.animationId, (current) => ({
        ...current,
        status: 'failed',
        error: outcome.reason,
      }));
      return;
    }

    // The clip is here and the runtime cannot open it. The page picks this up,
    // decodes it and sends the frames back as a request.
    await mutateAnimation(this.context.paths, job.characterId, job.animationId, (current) => ({
      ...current,
      status: 'awaiting-frames',
      clipFile: outcome.clipPath,
    }));
  }

  private async executeBuild(
    job: Extract<Job, { kind: 'build' }>,
    signal: AbortSignal,
  ): Promise<void> {
    const character = await readCharacter(this.context.paths, job.characterId);
    const animation = await readAnimation(this.context.paths, job.characterId, job.animationId);
    if (character === null || animation === null) return;

    await this.setStatus(job.characterId, job.animationId, 'compiling', 'Cleaning the frames…');
    const staged = await readStaged(this.context.paths, job.stagingKey);
    const sampled = staged.map((file, index) => ({
      bytes: file.bytes,
      durationMs: job.durationsMs[index] ?? Math.round(1000 / 12),
    }));

    const built = await buildAnimation(character, animation, await readBasePose(this.context.paths, character), sampled, {
      host: this.context.host,
      paths: this.context.paths,
      provider: await this.provider(),
      workspaceId: this.context.workspaceId,
      parentSessionId: this.context.sessionId,
      model: (await readState(this.context.paths)).settings.designModel,
      signal,
      onProgress: (message) => void this.progress(job.characterId, message, job.animationId),
    });
    await clearStaged(this.context.paths, job.stagingKey);

    if ('failed' in built) {
      await mutateAnimation(this.context.paths, job.characterId, job.animationId, (current) => ({
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
      await mutateAnimation(this.context.paths, job.characterId, job.animationId, (current) => ({
        ...current,
        status: 'failed',
        error: 'Nothing survived cleaning the clip, so there is no animation to show you.',
      }));
      return;
    }

    await mutateAnimation(this.context.paths, job.characterId, job.animationId, (current) => ({
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
  }

  private async setStatus(
    characterId: string,
    animationId: string,
    status: 'generating' | 'compiling' | 'judging',
    message: string,
  ): Promise<void> {
    await mutateAnimation(this.context.paths, characterId, animationId, (current) => ({
      ...current,
      status,
    }));
    await this.progress(characterId, message, animationId);
  }

  /** A line the rail can show, so a long run says what it is doing. */
  private async progress(characterId: string, message: string, animationId?: string): Promise<void> {
    void characterId;
    if (animationId === undefined) return;
    await updateState(this.context.paths, (current: DesignLibraryState) => ({
      ...current,
      sprite: {
        ...current.sprite,
        animations: current.sprite.animations.map((animation) =>
          animation.id === animationId ? { ...animation, progress: message } : animation,
        ),
      },
    }));
  }

  private async fail(job: Job, error: unknown): Promise<void> {
    if (!('animationId' in job) || !('characterId' in job)) return;
    const reason = error instanceof Error ? error.message : String(error);
    await mutateAnimation(this.context.paths, job.characterId, job.animationId, (current) => ({
      ...current,
      status: 'failed',
      error: reason,
    }));
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
