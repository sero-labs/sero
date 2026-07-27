import type { AppRuntimeHost } from '@sero-ai/common';

import { replaceGenerated } from '../shared/librarian';
import type { DesignLibraryPaths } from '../shared/paths';
import type { JobRecord } from '../shared/records';
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

export class AnalysisQueue {
  private readonly pending: string[] = [];
  private readonly running = new Map<string, AbortController>();
  private disposed = false;

  constructor(private readonly context: AnalysisQueueContext) {}

  /** Queue a job, ignoring one that is already queued or in flight. */
  enqueue(jobId: string): void {
    if (this.disposed) return;
    if (this.running.has(jobId) || this.pending.includes(jobId)) return;
    this.pending.push(jobId);
    void this.pump();
  }

  /** Abort a running job, or drop it from the queue if it never started. */
  cancel(jobId: string): void {
    const controller = this.running.get(jobId);
    if (controller) {
      controller.abort();
      return;
    }
    const index = this.pending.indexOf(jobId);
    if (index !== -1) this.pending.splice(index, 1);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.pending.length = 0;
    for (const controller of this.running.values()) controller.abort();
    this.running.clear();
  }

  private async pump(): Promise<void> {
    while (!this.disposed && this.running.size < MAX_CONCURRENT && this.pending.length > 0) {
      const jobId = this.pending.shift();
      if (jobId === undefined) return;
      const controller = new AbortController();
      this.running.set(jobId, controller);
      void this.execute(jobId, controller)
        .catch((error: unknown) => this.context.onError(`Analysis job ${jobId} threw`, error))
        .finally(() => {
          this.running.delete(jobId);
          void this.pump();
        });
    }
  }

  private async execute(jobId: string, controller: AbortController): Promise<void> {
    const { paths } = this.context;
    const job = await readJob(paths, jobId);
    if (!job) return;
    // A cancel that arrived while the job was still queued.
    if (job.cancelRequested === true) {
      await this.finishCancelled(job);
      return;
    }

    const item = await readItem(paths, job.itemId);
    if (!item) {
      await markFailed(paths, jobId, 'The item was removed before analysis started.');
      return;
    }

    await markRunning(paths, jobId);
    await mutateItem(paths, job.itemId, (current) => ({
      ...current,
      analysis: { ...current.analysis, status: 'running', jobId, startedAt: Date.now(), error: undefined },
    }));

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
      await this.finishCancelled(job);
      return;
    }

    if (outcome.status === 'failed') {
      await markFailed(paths, jobId, outcome.reason);
      await mutateItem(paths, job.itemId, (current) => ({
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

    // Reanalysis replaces the generated profile only — manual fields survive.
    await mutateItem(paths, job.itemId, (current) => ({
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
    await markSucceeded(paths, jobId);
  }

  private async finishCancelled(job: JobRecord): Promise<void> {
    await markCancelled(this.context.paths, job.id);
    await mutateItem(this.context.paths, job.itemId, (current) =>
      current.analysis.jobId === job.id
        ? { ...current, analysis: { ...current.analysis, status: 'cancelled', completedAt: Date.now() } }
        : current,
    );
  }
}
