import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { AppRuntimeHost } from '@sero-ai/common';

import type { DesignRecord, DesignRevision, DesignVariant } from '../../shared/design';
import type { DesignLibraryPaths } from '../../shared/paths';
import { revisionDir } from '../../shared/paths';
import type { JobRecord } from '../../shared/records';
import { readState } from '../../shared/state-io';
import type { EmittedFile } from '../../shared/targets';
import { PREVIEW_DOCUMENT_FILE, buildPreviewDocument } from '../build';
import { mutateVariant, readDesign } from '../design-store';
import { markCancelled, markFailed, markRunning, markSucceeded } from '../jobs';
import { readJob } from '../store';
import { collectReferenceLanguage, runGeneration } from './run';

/**
 * Runs variant generation jobs, a couple at a time.
 *
 * The same shape as the analysis queue, for the same reasons: bounded
 * concurrency because every job is a model call, an `AbortController` per run so
 * a cancel reaches the session immediately, and a claim check on every write so a
 * superseded job cannot overwrite the run that replaced it.
 *
 * Variants are independent (spec §6.4). One failing, or being cancelled, changes
 * nothing about its siblings — each writes only its own entry in the record, and
 * each holds the Design's record lock only for that write.
 */

const MAX_CONCURRENT = 2;

export interface VariantQueueContext {
  host: AppRuntimeHost;
  paths: DesignLibraryPaths;
  workspaceId: string;
  sessionId: string;
  onError(message: string, error: unknown): void;
}

interface InFlight {
  controller: AbortController;
  /** Resolves when the run has finished writing. Never rejects. */
  done: Promise<void>;
}

export class VariantQueue {
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

  constructor(private readonly context: VariantQueueContext) {}

  enqueue(jobId: string): void {
    if (this.disposed) return;
    if (this.running.has(jobId) || this.pending.includes(jobId)) return;
    this.pending.push(jobId);
    void this.pump();
  }

  /**
   * Abort a running job, or drop it from the queue if it never started. A job
   * that never started has no run to report its own cancellation, so the record
   * write below is what stops the variant showing a spinner for the session.
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
      if (job) await this.finishCancelled(job);
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
   * Stop accepting work and wait for what is already running. Aborting only asks
   * a run to stop; its writes land a tick later, and returning before they do
   * lets a disposed runtime write over a restarted one.
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
        .catch((error: unknown) => this.context.onError(`Generation job ${jobId} threw`, error))
        .finally(() => {
          this.running.delete(jobId);
          void this.pump();
        });
      this.running.set(jobId, { controller, done });
    }
  }

  /**
   * Apply a change only while the variant still points at this job. A job that
   * was superseded — cancelled and replaced by a retry — must not overwrite the
   * newer run's work just because it finished later.
   */
  private async applyIfCurrent(
    jobId: string,
    target: { designId: string; variantId: string },
    apply: (variant: DesignVariant) => DesignVariant,
    expect?: DesignVariant['status'],
  ): Promise<boolean> {
    let applied = false;
    await mutateVariant(this.context.paths, target.designId, target.variantId, (variant) => {
      if (variant.jobId !== jobId) return null;
      // Owning the variant is not enough for a terminal write. A cancel leaves
      // the job id in place while moving the variant to `cancelled`, so a run
      // that finished a moment later would report `ready` over it and the
      // cancellation would silently undo itself.
      if (expect !== undefined && variant.status !== expect) return null;
      applied = true;
      return apply(variant);
    });
    return applied;
  }

  private async execute(jobId: string, controller: AbortController): Promise<void> {
    const { paths } = this.context;
    const job = await readJob(paths, jobId);
    if (!job) return;
    if (job.target.kind !== 'variant') {
      await markFailed(paths, jobId, 'A generation job was queued without a variant to generate.');
      return;
    }
    const target = { designId: job.target.designId, variantId: job.target.variantId };

    if (job.cancelRequested === true) {
      await this.finishCancelled(job);
      return;
    }

    const design = await readDesign(paths, target.designId);
    const variant = design?.variants.find((entry) => entry.id === target.variantId);
    if (!design || !variant) {
      await markFailed(paths, jobId, 'The Design was removed before generation started.');
      return;
    }
    if (design.deletedAt !== undefined) {
      // A Design in Trash keeps what it already generated and stops spending on
      // work nobody asked to continue.
      await this.finishCancelled(job);
      return;
    }

    await markRunning(paths, jobId);
    const claimed = await this.applyIfCurrent(jobId, target, (current) => ({
      ...current,
      status: 'running',
      startedAt: Date.now(),
      error: undefined,
    }));
    if (!claimed) {
      await markCancelled(paths, jobId);
      return;
    }

    const state = await readState(paths);
    const recipe = state.settings.generation.recipes.find(
      (entry) => entry.id === design.brief.recipeId,
    );
    const references = await collectReferenceLanguage(paths, design);

    const outcome = await runGeneration(design, variant, references, recipe, {
      host: this.context.host,
      paths,
      workspaceId: this.context.workspaceId,
      parentSessionId: this.context.sessionId,
      model: state.settings.designModel,
      signal: controller.signal,
    });

    if (outcome.status === 'cancelled') {
      // Shutting down is not cancelling. Both arrive here as an aborted run, and
      // writing `cancelled` for either means quitting Sero mid-generation
      // retires the variant for good — restart recovery only revisits a job left
      // `running`, so nothing ever looks at it again. Leaving the job as it is
      // hands it back to reconciliation, which is what §6.7's "resumable work
      // continues after restart" requires.
      if (await this.abortedByShutdown(jobId)) return;
      await this.finishCancelled(job);
      return;
    }
    if (outcome.status === 'failed') {
      await this.fail(jobId, target, outcome.reason);
      return;
    }

    await this.storeRevision(job, design, target, outcome.files, outcome.summary);
  }

  /**
   * Write the revision, then finish the job, then point the variant at it.
   *
   * The order is forced: three files cannot be written atomically. Files first,
   * because the record entry naming them must never be the thing that exists
   * first; the job's terminal state next; the variant last. A crash anywhere
   * leaves a state restart recovery can repair, and the orphaned revision
   * directory is swept at startup.
   */
  private async storeRevision(
    job: JobRecord,
    design: DesignRecord,
    target: { designId: string; variantId: string },
    files: EmittedFile[],
    summary: string,
  ): Promise<void> {
    const { paths } = this.context;
    const revisionId = randomUUID();
    const directory = revisionDir(paths, target.designId, target.variantId, revisionId);

    const built = await buildPreviewDocument(design.brief.target, files);

    // Nothing renderable came out. The files are still worth keeping — they are
    // what the user reads to see what went wrong — but the variant fails, because
    // a build warning is a note about a page that works, not a substitute for one.
    if (built.document === undefined) {
      await this.writeFiles(directory, files);
      await this.fail(
        job.id,
        target,
        built.warnings.join(' ') || 'The design could not be built into a preview.',
      );
      return;
    }

    await this.writeFiles(directory, [
      ...files,
      { name: PREVIEW_DOCUMENT_FILE, content: built.document },
    ]);

    const revision: DesignRevision = {
      id: revisionId,
      createdAt: Date.now(),
      jobId: job.id,
      files: files.map((file) => ({ name: file.name, bytes: Buffer.byteLength(file.content, 'utf8') })),
      builtFile: PREVIEW_DOCUMENT_FILE,
      buildWarnings: built.warnings,
      summary,
    };

    await markSucceeded(paths, job.id);
    await this.applyIfCurrent(
      job.id,
      target,
      (variant) => ({
        ...variant,
        status: 'ready',
        error: undefined,
        attempts: variant.attempts + 1,
        revisions: [...variant.revisions, revision],
        visibleRevisionId: revision.id,
        completedAt: Date.now(),
      }),
      'running',
    );
  }

  private async writeFiles(directory: string, files: EmittedFile[]): Promise<void> {
    await mkdir(directory, { recursive: true });
    for (const file of files) {
      await writeFile(path.join(directory, file.name), file.content, 'utf8');
    }
  }

  private async fail(
    jobId: string,
    target: { designId: string; variantId: string },
    reason: string,
  ): Promise<void> {
    await markFailed(this.context.paths, jobId, reason);
    await this.applyIfCurrent(
      jobId,
      target,
      (variant) => ({
        ...variant,
        status: 'failed',
        error: reason,
        attempts: variant.attempts + 1,
        completedAt: Date.now(),
      }),
      'running',
    );
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

  private async finishCancelled(job: JobRecord): Promise<void> {
    if (job.target.kind !== 'variant') return;
    const target = { designId: job.target.designId, variantId: job.target.variantId };
    await markCancelled(this.context.paths, job.id);
    await this.applyIfCurrent(job.id, target, (variant) => ({
      ...variant,
      status: 'cancelled',
      completedAt: Date.now(),
    }));
  }
}
