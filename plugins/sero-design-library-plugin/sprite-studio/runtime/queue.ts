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
import { DEFAULT_SPRITE_STUDIO_SETTINGS, type PlanResult, type SpriteExportOptions } from '../shared/state';
import { reportSpriteNotice, reportSpriteProblem } from './projection';
import { openReviewWhenBatchLands, settleReview } from './review';
import { runAnimate, runBuild, runFix, runPropose, type JobRunner } from './queue-jobs';
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
      kind: 'propose';
      characterId: string;
      animationId: string;
      stagingKey: string;
      durationsMs: number[];
    }
  | {
      kind: 'build';
      characterId: string;
      animationId: string;
      stagingKey: string;
      durationsMs: number[];
      chosen: number[];
    }
  // Carries its character like every other job, so a purge can reach it. It is
  // a paid redraw, and one still running against a directory that has just been
  // deleted is money spent on nothing.
  | { kind: 'fix'; characterId: string; animationId: string; instruction: string; frameId?: string }
  | { kind: 'draw-character'; characterId: string; name: string; description: string }
  | {
      kind: 'export';
      exportId: string;
      characterId: string;
      animationIds: string[];
      options: SpriteExportOptions;
    };

/** One job in flight, and what cancelling it matches on. */
interface Run {
  controller: AbortController;
  /**
   * Settles when the run has actually stopped.
   *
   * Aborting is a request, not an event: the job is inside a provider call or a
   * write when the signal fires, and it carries on until it reaches a point
   * that checks. Shutdown has to wait for that point, or the process leaves
   * while a frame is half written.
   */
  done: Promise<void>;
  characterId?: string;
  animationId?: string;
}

export class SpriteQueue implements JobRunner {
  private readonly waiting: Job[] = [];
  /**
   * What is running, by a ticket of its own rather than by what it works on.
   *
   * Keying by animation id looked tidy and was wrong twice over: two jobs for
   * one animation — a repair asked for while another is running — overwrote
   * each other, so the first was never abortable, the second's entry was
   * deleted by the first to finish, and the concurrency cap counted one where
   * there were two. The ticket makes each run its own thing; the fields beside
   * it are what cancelling matches on.
   */
  private readonly running = new Map<number, Run>();
  private nextTicket = 1;
  private readonly shutdown = new AbortController();
  private draining = false;
  /**
   * Set by `dispose`, and the reason `drain` consults it.
   *
   * Every run re-drains on its way out, so aborting the running jobs was not
   * enough to stop the queue: the last one out started the next thing waiting,
   * and the queue went on working after the app had been told to close.
   */
  private disposed = false;

  constructor(private readonly context: SpriteQueueContext) {}

  plan(characterId: string, planId: string, request: string, videoModel: string): void {
    this.push({ kind: 'plan', characterId, planId, request, videoModel });
  }

  animate(characterId: string, animationId: string): void {
    this.push({ kind: 'animate', characterId, animationId });
  }

  propose(
    characterId: string,
    animationId: string,
    stagingKey: string,
    durationsMs: number[],
  ): void {
    this.push({ kind: 'propose', characterId, animationId, stagingKey, durationsMs });
  }

  build(
    characterId: string,
    animationId: string,
    stagingKey: string,
    durationsMs: number[],
    chosen: number[],
  ): void {
    this.push({ kind: 'build', characterId, animationId, stagingKey, durationsMs, chosen });
  }

  fix(characterId: string, animationId: string, instruction: string, frameId?: string): void {
    this.push({
      kind: 'fix',
      characterId,
      animationId,
      instruction,
      ...(frameId === undefined ? {} : { frameId }),
    });
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
    this.stop((run) => run.animationId === animationId);
    this.drop((job) => 'animationId' in job && job.animationId === animationId);
  }

  /**
   * Stop everything belonging to one character.
   *
   * By what the job is for, rather than by a key that happened to start with
   * the character's id. An animation job was keyed by its own id, so matching
   * keys against the character missed every one of them — purging a character
   * left its clip still being drawn and paid for, against a directory that had
   * just been deleted. Nothing reached this until purge was given a button.
   */
  cancelCharacter(characterId: string): void {
    this.stop((run) => run.characterId === characterId);
    this.drop((job) => 'characterId' in job && job.characterId === characterId);
  }

  /**
   * Abort every run that matches, however many there are.
   *
   * The entry stays in the map until the run itself settles and removes it in
   * its `finally`. Deleting it here made an aborted run invisible: a second
   * cancel could not find it, the concurrency cap counted it as gone and
   * started its replacement, and a purge that had already "cancelled"
   * everything still had a job running that would write the character's files
   * back after they had been removed.
   */
  private stop(matches: (run: Run) => boolean): void {
    for (const run of this.running.values()) {
      if (matches(run)) run.controller.abort();
    }
  }

  /** Take matching jobs out of the queue before they ever start. */
  private drop(matches: (job: Job) => boolean): void {
    for (let at = this.waiting.length - 1; at >= 0; at--) {
      const job = this.waiting[at];
      if (job !== undefined && matches(job)) this.waiting.splice(at, 1);
    }
  }

  /**
   * Stop, and be stopped before this returns.
   *
   * Three things, and each one was missing: waiting work is dropped, or the
   * next drain starts it; the flag is set before anything else, or a run
   * settling mid-shutdown re-drains behind us; and the runs are awaited, so
   * "disposed" means finished rather than merely asked to stop.
   */
  async dispose(): Promise<void> {
    this.disposed = true;
    this.shutdown.abort();
    this.waiting.length = 0;
    const settling = [...this.running.values()].map((run) => {
      run.controller.abort();
      return run.done;
    });
    await Promise.allSettled(settling);
  }

  private push(job: Job): void {
    if (this.disposed) return;
    this.waiting.push(job);
    void this.drain();
  }

  /**
   * How many jobs may run at once.
   *
   * Falls back rather than throwing. This is read at the top of every drain, and
   * a drain that throws leaves the queue with work waiting and nothing to
   * schedule another one — which now means an animation claimed for building
   * and never built. An unreadable settings file must not cost that.
   */
  private async concurrency(): Promise<number> {
    const state = await readState(this.context.paths).catch(() => null);
    const stored = state?.sprite.settings.concurrency;
    // A stored value has to be a real number, not merely present. `NaN` would
    // make `running.size < limit` false for ever, which is a queue that
    // silently never runs anything again.
    const wanted =
      typeof stored === 'number' && Number.isFinite(stored)
        ? Math.round(stored)
        : DEFAULT_SPRITE_STUDIO_SETTINGS.concurrency;
    return Math.max(1, Math.min(5, wanted));
  }

  private async drain(): Promise<void> {
    if (this.draining || this.disposed) return;
    this.draining = true;
    try {
      const limit = await this.concurrency();
      // Read again after the await: settings are read from disk, and a dispose
      // during that read would otherwise be overtaken by this loop.
      while (!this.disposed && this.waiting.length > 0 && this.running.size < limit) {
        const job = this.waiting.shift();
        if (job === undefined) break;
        this.run(job);
      }
    } finally {
      this.draining = false;
    }
  }

  private run(job: Job): void {
    const ticket = this.nextTicket++;
    const controller = new AbortController();
    // What this run is for, recorded beside it. Cancelling matches on these
    // rather than on a key, so a second job for the same animation is a second
    // entry and both are reachable.
    //
    // Registered before the work starts, and holding the promise the work runs
    // on, so shutdown can wait for it. `done` is filled in below rather than
    // here because the body removes this entry on its way out, and it must find
    // it there to remove.
    const entry: Run = {
      controller,
      done: Promise.resolve(),
      ...('characterId' in job ? { characterId: job.characterId } : {}),
      ...('animationId' in job ? { animationId: job.animationId } : {}),
    };
    this.running.set(ticket, entry);
    entry.done = this.carryOut(job, ticket, controller);
  }

  private async carryOut(job: Job, ticket: number, controller: AbortController): Promise<void> {
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
      this.running.delete(ticket);
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
      case 'propose':
        return runPropose(this, job, signal);
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
    status: 'generating' | 'proposing' | 'compiling' | 'judging',
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
      const failed = await mutateAnimation(
        this.context.paths,
        job.characterId,
        job.animationId,
        (current) => ({ ...current, status: 'failed', error: reason }),
      );
      // A failed run is not a review anybody can finish, and leaving the
      // proposal on the record would point it at samples housekeeping is now
      // free to delete. Both go together or neither does.
      if (failed !== null) {
        await settleReview(this.context.paths, failed);
        // A failure is the batch landing too. Without this, one clip that fell
        // over holds the reviews of everything beside it shut for ever.
        await openReviewWhenBatchLands(this.context.paths, failed);
      }
      return;
    }
    if (job.kind === 'plan') {
      await this.settlePlan(job.planId, { status: 'failed', reason });
      return;
    }
    await reportSpriteProblem(this.context.paths, reason);
  }
}
