import type { AppRuntimeHost } from '@sero-ai/common';

import { replaceGenerated } from '../shared/librarian';
import type { DesignLibraryPaths } from '../shared/paths';
import type { ItemRecord, JobRecord } from '../shared/records';
import { readState } from '../shared/state-io';
import { runLibrarian } from './librarian/run';
import { markCancelled, markFailed, markRunning, markSucceeded } from './jobs';
import { mutateItem, readItem, readJob } from './store';

/**
 * Runs analysis jobs, a couple at a time.
 *
 * Concurrency is bounded because a bulk import can queue dozens of jobs at
 * once and every one of them is a model call. Each running job holds an
 * `AbortController` so cancellation reaches the session immediately rather
 * than waiting for the run to finish on its own.
 *
 * Two rules keep a finished job from corrupting state it no longer owns:
 * shutdown waits for in-flight work instead of merely asking it to stop, and
 * every write checks the item still points at the writing job.
 */

const MAX_CONCURRENT = 2;

export interface AnalysisQueueContext {
  host: AppRuntimeHost;
  paths: DesignLibraryPaths;
  workspaceId: string;
  /** The session analysis runs are attributed to. */
  sessionId: string;
  onError(message: string, error: unknown): void;
}

interface InFlight {
  controller: AbortController;
  /** Resolves when the run has finished writing. Never rejects. */
  done: Promise<void>;
}

export class AnalysisQueue {
  private readonly pending: string[] = [];
  private readonly running = new Map<string, InFlight>();
  /**
   * Cancelling a job that never started still writes — to the job and to its
   * target — and those writes are not owned by any entry in `running`. Tracked
   * here so `dispose` waits for them too; returning while one is still in flight
   * lets a disposed runtime write over a restarted one.
   */
  private readonly cancelling = new Set<Promise<void>>();
  private disposed = false;

  constructor(private readonly context: AnalysisQueueContext) {}

  /** Queue a job, ignoring one that is already queued or in flight. */
  enqueue(jobId: string): void {
    if (this.disposed) return;
    if (this.running.has(jobId) || this.pending.includes(jobId)) return;
    this.pending.push(jobId);
    void this.pump();
  }

  /**
   * Abort a running job, or drop it from the queue if it never started.
   *
   * A job that never started has no run to report its own cancellation, so
   * dropping it from `pending` is only half the job: without the write below
   * the job record stays `queued` and the item stays `pending`, and the item
   * keeps its spinner for the rest of the session.
   */
  async cancel(jobId: string): Promise<void> {
    const inFlight = this.running.get(jobId);
    if (inFlight) {
      inFlight.controller.abort();
      return;
    }
    const index = this.pending.indexOf(jobId);
    if (index === -1) return;
    this.pending.splice(index, 1);
    await this.track(async () => {
      const job = await readJob(this.context.paths, jobId);
      if (job?.target.kind === 'item') await this.finishCancelled(job, job.target.itemId);
    });
  }

  /** Run a write that no `running` entry owns, so `dispose` can wait for it. */
  private async track(write: () => Promise<void>): Promise<void> {
    const pending = write().catch((error: unknown) =>
      this.context.onError('A cancellation write failed', error),
    );
    this.cancelling.add(pending);
    try {
      await pending;
    } finally {
      this.cancelling.delete(pending);
    }
  }

  /** Resolves once the job is no longer writing — immediately if it never was. */
  async settled(jobId: string): Promise<void> {
    await this.running.get(jobId)?.done;
  }

  /**
   * Stop accepting work and wait for what is already running.
   *
   * Aborting only *asks* a run to stop; its writes land a tick later. Returning
   * before they do lets a disposed runtime write over a restarted one — and, in
   * tests, lets a write race the temporary directory being removed.
   */
  async dispose(): Promise<void> {
    this.disposed = true;
    this.pending.length = 0;
    const inFlight = [...this.running.values()];
    for (const entry of inFlight) entry.controller.abort();
    await Promise.allSettled([...inFlight.map((entry) => entry.done), ...this.cancelling]);
    this.running.clear();
  }

  private async pump(): Promise<void> {
    while (!this.disposed && this.running.size < MAX_CONCURRENT && this.pending.length > 0) {
      const jobId = this.pending.shift();
      if (jobId === undefined) return;

      const controller = new AbortController();
      const done = this.execute(jobId, controller)
        .catch((error: unknown) => this.context.onError(`Analysis job ${jobId} threw`, error))
        .finally(() => {
          this.running.delete(jobId);
          void this.pump();
        });
      this.running.set(jobId, { controller, done });
    }
  }

  /**
   * Apply a result only while the item still points at this job. A job that was
   * superseded — cancelled and replaced by a forced reanalysis, say — must not
   * overwrite the newer run's work just because it finished later.
   */
  private async applyIfCurrent(
    jobId: string,
    itemId: string,
    apply: (item: ItemRecord) => ItemRecord,
  ): Promise<boolean> {
    let applied = false;
    await mutateItem(this.context.paths, itemId, (item) => {
      if (item.analysis.jobId !== jobId) return null;
      applied = true;
      return apply(item);
    });
    return applied;
  }

  private async execute(jobId: string, controller: AbortController): Promise<void> {
    const { paths } = this.context;
    const job = await readJob(paths, jobId);
    if (!job) return;
    // This queue only runs analysis, which always belongs to an item. Anything
    // else reaching it is a routing mistake, and failing the job says so rather
    // than leaving it queued forever.
    if (job.target.kind !== 'item') {
      await markFailed(paths, jobId, 'An analysis job was queued without an item to analyse.');
      return;
    }
    const itemId = job.target.itemId;
    // A cancel that arrived while the job was still queued.
    if (job.cancelRequested === true) {
      await this.finishCancelled(job, itemId);
      return;
    }

    const item = await readItem(paths, itemId);
    if (!item) {
      await markFailed(paths, jobId, 'The item was removed before analysis started.');
      return;
    }

    await markRunning(paths, jobId);
    const claimed = await this.applyIfCurrent(jobId, itemId, (current) => ({
      ...current,
      analysis: { ...current.analysis, status: 'running', jobId, startedAt: Date.now(), error: undefined },
    }));
    // The item moved on to another job before this one started.
    if (!claimed) {
      await markCancelled(paths, jobId);
      return;
    }

    const state = await readState(paths);
    const outcome = await runLibrarian(item, {
      host: this.context.host,
      paths,
      workspaceId: this.context.workspaceId,
      parentSessionId: this.context.sessionId,
      model: state.settings.librarianModel,
      signal: controller.signal,
    });

    if (outcome.status === 'cancelled') {
      // Shutting down is not cancelling. Both reach here as an aborted run, and
      // recording `cancelled` for a shutdown retires the analysis for good —
      // restart recovery only revisits a job left `running`. Leaving the job as
      // it is hands it back to reconciliation, which resumes it.
      if (await this.abortedByShutdown(jobId)) return;
      await this.finishCancelled(job, itemId);
      return;
    }

    if (outcome.status === 'failed') {
      await markFailed(paths, jobId, outcome.reason);
      await this.applyIfCurrent(jobId, itemId, (current) => ({
        ...current,
        analysis: {
          ...current.analysis,
          status: 'failed',
          jobId,
          error: outcome.reason,
          attempts: current.analysis.attempts + 1,
          completedAt: Date.now(),
        },
      }));
      return;
    }

    // The job reaches its terminal state before the item does, matching the
    // failure path above. The other order leaves a window where the item reads
    // `ready` while its own job still reads `running` — anything that trusts
    // the item and then looks up the job sees a contradiction.
    await markSucceeded(paths, jobId);

    // Reanalysis replaces the generated profile only — manual fields survive.
    await this.applyIfCurrent(jobId, itemId, (current) => ({
      ...current,
      profile: replaceGenerated(current.profile, outcome.analysis),
      analysis: {
        status: 'ready',
        jobId,
        attempts: current.analysis.attempts + 1,
        startedAt: current.analysis.startedAt,
        completedAt: Date.now(),
      },
    }));
  }

  /**
   * True when this run stopped because the runtime is going away rather than
   * because anyone asked it to. The job record is the authority — a cancel
   * requested before the abort is durable and outranks the shutdown.
   */
  private async abortedByShutdown(jobId: string): Promise<boolean> {
    if (!this.disposed) return false;
    const job = await readJob(this.context.paths, jobId);
    return job?.cancelRequested !== true;
  }

  private async finishCancelled(job: JobRecord, itemId: string): Promise<void> {
    await markCancelled(this.context.paths, job.id);
    await this.applyIfCurrent(job.id, itemId, (current) => ({
      ...current,
      analysis: { ...current.analysis, status: 'cancelled', completedAt: Date.now() },
    }));
  }
}
