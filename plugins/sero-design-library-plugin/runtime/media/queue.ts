import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { AppRuntimeHost } from '@sero-ai/common';

import { currentAttempt } from '../../shared/media';
import type { DesignLibraryPaths } from '../../shared/paths';
import type { JobRecord } from '../../shared/records';
import type { MediaSettings } from '../../shared/settings';
import { readState } from '../../shared/state-io';
import { readDesign } from '../design-store';
import { ingestUpload } from '../ingest';
import { markCancelled, markFailed, markRunning, markSucceeded } from '../jobs';
import { readJob } from '../store';
import { MediaBudget, createVideoConfirmer } from './budget';
import type { MediaProvider } from './contract';
import { generateIntoLibrary } from './library';
import { createMediaProviderForRun } from './provider';
import { releaseAsset } from './assets';
import { generateForAsset, type MediaToolContext } from './tools';

/**
 * Explicit media generation, as background jobs.
 *
 * The same shape as the analysis and variant queues, and for the same reasons:
 * every job is a paid call, so concurrency is bounded; each holds an
 * `AbortController` so a cancel reaches the provider immediately; and disposal
 * waits for in-flight writes rather than returning while one is still landing.
 *
 * Explicit actions and agent calls end in the same `generateAsset`, so there is
 * one implementation and no divergence between the two routes (D5).
 */

const MAX_CONCURRENT = 2;

export interface MediaQueueContext {
  host: AppRuntimeHost;
  paths: DesignLibraryPaths;
  onError(message: string, error: unknown): void;
  /**
   * Where the provider comes from. Defaults to the shipped fal adapter.
   *
   * The seam exists so the tests, and the fault-injection harness, can drive the
   * whole request → job → record path against a deterministic provider without
   * network or spend. Injecting it beats reading an environment variable in
   * production code: there is no way for a stray variable to swap the real
   * provider out of a running app.
   */
  createProvider?(paths: DesignLibraryPaths, settings: MediaSettings): Promise<MediaProvider>;
  /**
   * Called with an item this queue created, so the coordinator can start
   * analysing it.
   *
   * A callback rather than appending an `ingest` request. Requests are how *other
   * processes* ask the runtime to do something; the runtime queueing work for
   * itself would only be picked up when the host's watcher noticed the runtime's
   * own state write, and nothing else in here relies on that. The coordinator
   * still owns the analysis kick-off, as it does for every other route in.
   */
  onItemCreated?(itemId: string): Promise<void>;
}

interface InFlight {
  controller: AbortController;
  done: Promise<void>;
}

export class MediaQueue {
  private readonly pending: string[] = [];
  private readonly running = new Map<string, InFlight>();
  private disposed = false;

  constructor(private readonly context: MediaQueueContext) {}

  enqueue(jobId: string): void {
    if (this.disposed) return;
    if (this.running.has(jobId) || this.pending.includes(jobId)) return;
    this.pending.push(jobId);
    void this.pump();
  }

  async cancel(jobId: string): Promise<void> {
    const inFlight = this.running.get(jobId);
    if (inFlight) {
      inFlight.controller.abort();
      return;
    }
    const index = this.pending.indexOf(jobId);
    if (index !== -1) {
      this.pending.splice(index, 1);
      await markCancelled(this.context.paths, jobId);
    }
  }

  async settled(jobId: string): Promise<void> {
    await this.running.get(jobId)?.done;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.pending.length = 0;
    const inFlight = [...this.running.values()];
    for (const entry of inFlight) entry.controller.abort();
    await Promise.allSettled(inFlight.map((entry) => entry.done));
    this.running.clear();
  }

  private async pump(): Promise<void> {
    while (!this.disposed && this.running.size < MAX_CONCURRENT && this.pending.length > 0) {
      const jobId = this.pending.shift();
      if (jobId === undefined) return;

      const controller = new AbortController();
      const done = this.execute(jobId, controller)
        .catch((error: unknown) => this.context.onError(`Media job ${jobId} threw`, error))
        .finally(() => {
          this.running.delete(jobId);
          void this.pump();
        });
      this.running.set(jobId, { controller, done });
    }
  }

  private async provider(settings: MediaSettings): Promise<MediaProvider> {
    const create = this.context.createProvider ?? createMediaProviderForRun;
    return create(this.context.paths, settings);
  }

  /**
   * A budget for one explicit action.
   *
   * `callsPerRun` is the *run* cap and a single explicit action is not a run, so
   * it gets a budget of one: the user asked for one image and pressing a button
   * cannot spend more than the thing it is attached to. Video still confirms.
   */
  private budgetFor(designTitle?: string): MediaBudget {
    return new MediaBudget({
      callsPerRun: 1,
      confirmVideo: createVideoConfirmer(
        this.context.host.notifications,
        designTitle === undefined ? {} : { designTitle },
      ),
    });
  }

  private async execute(jobId: string, controller: AbortController): Promise<void> {
    const { paths } = this.context;
    const job = await readJob(paths, jobId);
    if (!job) return;
    if (job.cancelRequested === true) {
      await markCancelled(paths, jobId);
      return;
    }

    await markRunning(paths, jobId);
    if (job.target.kind === 'asset') {
      await this.runAssetJob(job, job.target.designId, job.target.assetId, controller);
      return;
    }
    if (job.target.kind === 'library') {
      await this.runLibraryJob(job, controller);
      return;
    }
    await markFailed(paths, jobId, 'A media job was queued with nothing to generate.');
  }

  private async runAssetJob(
    job: JobRecord,
    designId: string,
    assetId: string,
    controller: AbortController,
  ): Promise<void> {
    const { paths } = this.context;
    const design = await readDesign(paths, designId);
    const asset = design?.assets.find((entry) => entry.id === assetId);
    if (!design || !asset) {
      await markFailed(paths, job.id, 'The Design or asset was removed before generation started.');
      return;
    }

    // The asset must still say this job owns it, checked immediately before any
    // money is spent.
    //
    // A job record and the asset that points at it are separate files and
    // cannot be written together. A crash between `createJob` and
    // `reserveAsset` leaves a queued job the asset never adopted; the replayed
    // request then reserves the asset under a *second* job, and both would
    // generate — two provider calls, two charges, for one press. Ownership is
    // the thing that tells them apart, so it is checked here rather than
    // assumed from the job existing.
    if (asset.jobId !== job.id) {
      await markFailed(
        paths,
        job.id,
        'Another attempt already owns this asset, so this one was dropped rather than generating it twice.',
      );
      return;
    }

    const state = await readState(paths);
    const provider = await this.provider(state.settings.media);
    const budget = this.budgetFor(design.title);
    const context: MediaToolContext = {
      paths,
      designId,
      provider,
      budget,
      signal: controller.signal,
      jobId: job.id,
      librarySources: 'all',
      ...(asset.originVariantId === undefined
        ? {}
        : { originVariantId: asset.originVariantId }),
    };

    // The asset was reserved when the request was applied, so this is an attempt
    // against an existing one whether it is the first or the fifth. Reserving
    // here as well would produce a second asset on every retry.
    const outcome = await generateForAsset(asset, context);

    if ('refused' in outcome) {
      // Ownership is released, because nothing was attempted. A refusal writes
      // no attempt, so the asset would otherwise keep pointing at a job that
      // has finished — and `media.retry` reads a live `jobId` as "already
      // working" and does nothing. Declining one video would leave its Retry
      // dead until the next restart.
      await releaseAsset(paths, designId, assetId, job.id);
      await markFailed(paths, job.id, outcome.refused);
      return;
    }
    const attempt = currentAttempt(outcome.asset);
    if (attempt?.outcome !== 'ready') {
      // The asset keeps its placeholder and its retry; the job records why.
      await markFailed(paths, job.id, attempt?.error?.message ?? 'The provider failed.');
      return;
    }
    await markSucceeded(paths, job.id);
  }

  private async runLibraryJob(job: JobRecord, controller: AbortController): Promise<void> {
    const { paths } = this.context;
    // Read off the job record rather than held in memory, so a generation
    // interrupted by a restart resumes with what was actually asked for.
    const request = job.media;
    if (!request) {
      await markFailed(paths, job.id, 'This generation was queued without anything to generate.');
      return;
    }

    const state = await readState(paths);
    const provider = await this.provider(state.settings.media);
    const budget = this.budgetFor();
    const directory = await mkdtemp(path.join(tmpdir(), 'design-library-generate-'));

    try {
      const outcome = await generateIntoLibrary(request, {
        paths,
        provider,
        budget,
        signal: controller.signal,
        directory,
      });

      if (outcome.status === 'refused') {
        await markFailed(paths, job.id, outcome.reason);
        return;
      }
      if (outcome.status === 'failed') {
        await markFailed(paths, job.id, outcome.attempt.error?.message ?? 'The provider failed.');
        return;
      }

      // The staged upload becomes an item through the ordinary import path, so
      // duplicate detection applies to a generated item exactly as it does to an
      // imported one.
      const ingested = await ingestUpload(paths, outcome.uploadId);
      if (ingested.status === 'failed') {
        await markFailed(paths, job.id, ingested.reason);
        return;
      }
      await markSucceeded(paths, job.id);
      // Only a new item needs looking at; a duplicate has already been analysed.
      if (ingested.status === 'created') await this.context.onItemCreated?.(ingested.item.id);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
