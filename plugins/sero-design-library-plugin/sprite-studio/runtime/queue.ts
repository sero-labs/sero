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
import type { PlanResult, SpriteExportOptions } from '../shared/state';
import { reportSpriteNotice, reportSpriteProblem } from './projection';
import { runAnimate, runBuild, runFix, type JobRunner } from './queue-jobs';
// `requests.ts` imports this file for its type only, so this is not a cycle.
import { setOpen } from './requests';
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

export class SpriteQueue implements JobRunner {
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

  async provider(): Promise<MediaProvider> {
    const state = await readState(this.context.paths);
    const create = this.context.createProvider ?? createMediaProviderForRun;
    return create(this.context.paths, state.settings.media);
  }

  get paths(): DesignLibraryPaths {
    return this.context.paths;
  }

  get host(): AppRuntimeHost {
    return this.context.host;
  }

  get workspaceId(): string {
    return this.context.workspaceId;
  }

  get sessionId(): string {
    return this.context.sessionId;
  }

  async changed(): Promise<void> {
    await this.context.onChanged();
  }

  private async execute(job: Job, signal: AbortSignal): Promise<void> {
    switch (job.kind) {
      case 'plan':
        return this.executePlan(job, signal);
      // The three that make an animation live in `queue-jobs.ts`; this file is
      // about queueing them.
      case 'animate':
        return runAnimate(this, job, signal);
      case 'build':
        return runBuild(this, job, signal);
      case 'fix':
        return runFix(this, job, signal);
      case 'draw-character':
        return this.executeDrawCharacter(job, signal);
      case 'export':
        return this.executeExport(job);
    }
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
    if (character === null) {
      await this.settlePlan(job.planId, {
        status: 'failed',
        reason: 'That character no longer exists.',
      });
      return;
    }
    const state = await readState(this.context.paths);

    const outcome = await runPlan(character, job.request, job.videoModel, {
      host: this.context.host,
      workspaceId: this.context.workspaceId,
      parentSessionId: this.context.sessionId,
      model: state.settings.designModel,
      signal,
      onProgress: (message) => void this.progress(job.characterId, message),
    });

    await this.settlePlan(
      job.planId,
      outcome.status === 'ok'
        ? { status: 'ok', animations: outcome.animations }
        : {
            status: outcome.status,
            reason: outcome.status === 'failed' ? outcome.reason : 'Cancelled.',
          },
    );
  }

  /**
   * Write an answer against a plan id, whatever the answer is.
   *
   * The dialog waits on this entry and has nothing else to go on: it shows a
   * spinner until one appears. So **every** way out of planning has to leave
   * one, including the ways that are not the plan arriving — a model that is
   * not configured, a host that threw, a character deleted mid-thought. A path
   * that returns without writing here is a spinner that never stops, with the
   * only reason in a log file.
   */
  private async settlePlan(planId: string, result: PlanResult): Promise<void> {
    await updateState(this.context.paths, (current: DesignLibraryState) => ({
      ...current,
      sprite: {
        ...current.sprite,
        plans: { ...current.sprite.plans, [planId]: result },
      },
    }));
  }

  async setStatus(
    characterId: string,
    animationId: string,
    status: 'generating' | 'compiling' | 'judging',
    message: string,
  ): Promise<void> {
    await mutateAnimation(this.context.paths, characterId, animationId, (current) => ({
      ...current,
      status,
    }));
    // Projected here rather than at the end of the job. A record change the
    // projection has not caught up with is a screen showing the step before
    // this one for as long as this one takes, which is minutes.
    await this.context.onChanged();
    await this.progress(characterId, message, animationId);
  }

  /**
   * A line the rail can show, so a long run says what it is doing.
   *
   * Work that belongs to an animation says so on the animation. Work that
   * belongs to the character — drawing one from words, exporting a sheet — has
   * no row to speak from, so it speaks in the notice bar. Dropping it, which is
   * what used to happen, made an export write two files and say nothing at all,
   * including where it put them.
   */
  async progress(characterId: string, message: string, animationId?: string): Promise<void> {
    void characterId;
    if (animationId === undefined) {
      await reportSpriteNotice(this.context.paths, message, 'done');
      return;
    }
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

  /**
   * Every failure lands somewhere the user looks.
   *
   * An animation carries its own error. A plan settles the entry the dialog is
   * waiting on. Everything else has no record of its own, so it goes to the
   * notice — because a job that throws and reports nowhere is a button that
   * does nothing and a reason that lives in a log file.
   */
  private async fail(job: Job, error: unknown): Promise<void> {
    const reason = error instanceof Error ? error.message : String(error);
    if ('animationId' in job && 'characterId' in job) {
      await mutateAnimation(this.context.paths, job.characterId, job.animationId, (current) => ({
        ...current,
        status: 'failed',
        error: reason,
      }));
      return;
    }
    if (job.kind === 'plan') {
      await this.settlePlan(job.planId, { status: 'failed', reason });
      return;
    }
    await reportSpriteProblem(this.context.paths, reason);
  }
}
