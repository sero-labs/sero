import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { AppRuntimeHost } from '@sero-ai/common';

import type {
  DesignRecord,
  DesignRevision,
  DesignVariant,
  PendingRevision,
} from '../../shared/design';
import type { DesignLibraryPaths } from '../../shared/paths';
import type { JobRecord } from '../../shared/records';
import type { MediaSettings } from '../../shared/settings';
import { readState } from '../../shared/state-io';
import type { EmittedFile } from '../../shared/targets';
import { readAssetBytes } from '../media/assets';
import { MediaBudget, createVideoConfirmer } from '../media/budget';
import { resolveFalKey } from '../../shared/credentials';
import { createMediaProviderForRun } from '../media/provider';
import { createMediaTools } from '../media/tools';
import {
  applyRevisionBehaviour,
  readRevisionSource,
  storeRevisionFiles,
  type RevisionNaming,
} from './revision-files';
import { mutateVariant, readDesign } from '../design-store';
import { markCancelled, markFailed, markRunning, markSucceeded } from '../jobs';
import { mutateJob, readJob } from '../store';
import { createGenerationMediaProgressReporter, createGenerationProgressReporter } from './progress';
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
   *
   * Defence rather than a demonstrated failure: every caller awaits `cancel`,
   * and disposal already waits on in-flight runs that in practice outlast a
   * short cancellation write, so the suite cannot pin the window down. It is
   * cheap, and the same window with a run in it was a real bug in PR 1.
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
      progress: 'Starting your design…',
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
    // Two independent reads. A revise carries the page it is editing, read from
    // the record rather than held from the request that asked for it, so it
    // survives a restart between the ask and the run.
    const [references, revise] = await Promise.all([
      collectReferenceLanguage(paths, design),
      readRevisionSource(paths, design, variant),
    ]);
    if (variant.pendingRevision !== undefined && revise === null) {
      await this.fail(
        jobId,
        target,
        'The revision this change was to start from is no longer there, so there was nothing to revise.',
      );
      await this.clearPendingRevision(target);
      return;
    }

    // Settle status writes before the terminal write, so a late update cannot
    // put "Writing…" back onto a completed variant.
    const progress = createGenerationProgressReporter(
      async (message) => {
        await this.applyIfCurrent(jobId, target, (current) => ({ ...current, progress: message }), 'running');
      },
      (error) => this.context.onError('Could not update generation progress', error),
    );

    // Media rides in as `customTools` (D5). The budget is per run, so it is
    // built here and lives exactly as long as this generation does.
    const media = await this.mediaTools(design, state.settings.media, jobId, variant.id, controller, progress.report);

    const outcome = await runGeneration(
      design,
      variant,
      references,
      recipe,
      {
        host: this.context.host,
        paths,
        workspaceId: this.context.workspaceId,
        parentSessionId: this.context.sessionId,
        model: state.settings.designModel,
        signal: controller.signal,
        mediaTools: media.tools,
        mediaCallsRemaining: media.budget.callsRemaining,
        onProgress: progress.report,
      },
      revise ?? undefined,
    );
    await progress.settle();

    if (outcome.status === 'cancelled') {
      // Shutting down is not cancelling. Both arrive here as an aborted run, and
      // writing `cancelled` for either means quitting Sero mid-generation
      // retires the variant for good — restart recovery only revisits a job left
      // `running`, so nothing ever looks at it again. Leaving the job as it is
      // hands it back to reconciliation, which is what §6.7's "resumable work
      // continues after restart" requires.
      //
      // The instruction is left alone here for the same reason. Clearing it
      // before this check would mean quitting Sero mid-revise came back to a
      // variant that regenerates itself from the original brief — the one
      // outcome a revise must never have.
      if (await this.abortedByShutdown(jobId)) return;
      // An explicit stop does drop it: the next run on this variant is whatever
      // the user asks for then, not the revise they just cancelled. A failure
      // keeps it, so Retry repeats the change.
      await this.clearPendingRevision(target);
      await this.finishCancelled(job);
      return;
    }
    if (outcome.status === 'failed') {
      await this.fail(jobId, target, outcome.reason);
      return;
    }

    await this.storeRevision(job, design, target, outcome.files, {
      name: outcome.name,
      summary: outcome.summary,
      tweaks: outcome.tweaks,
      ...(outcome.model === undefined ? {} : { model: outcome.model }),
      ...(revise === null ? {} : { revision: variant.pendingRevision }),
    });

    // The cap is reported after the fact, never as a failure: a design that got
    // three of the four images it wanted is still a design (spec §8.4).
    const capped = media.budget.summary();
    if (capped !== null) this.context.onError(capped, null);
  }

  /**
   * The media surface for one run.
   *
   * Absent — not merely refusing — when there is no key or the cap is zero. A
   * model handed tools that fail every call spends the run arguing with them
   * instead of writing the page, so the run is told in its task that it has none
   * and what to do instead.
   */
  private async mediaTools(
    design: DesignRecord,
    settings: MediaSettings,
    jobId: string,
    variantId: string,
    controller: AbortController,
    onProgress: (message: string) => void,
  ): Promise<{ tools: ToolDefinition[]; budget: MediaBudget }> {
    // Seeded from the job, so a run interrupted after spending its allowance
    // does not come back with the whole allowance again (D10). The cap bounds
    // the run, not the process that happened to be executing it.
    const job = await readJob(this.context.paths, jobId);
    const budget = new MediaBudget({
      callsPerRun: settings.callsPerRun,
      ...(job?.mediaCallsUsed === undefined ? {} : { alreadyUsed: job.mediaCallsUsed }),
      confirmVideo: createVideoConfirmer(this.context.host.notifications, {
        designTitle: design.title,
      }),
      onClaimed: async (used) => {
        await mutateJob(this.context.paths, jobId, (current) => ({
          ...current,
          mediaCallsUsed: used,
        }));
      },
    });

    const key = await resolveFalKey(this.context.paths);
    if (key === undefined || settings.callsPerRun === 0) return { tools: [], budget };

    const provider = await createMediaProviderForRun(this.context.paths, settings);
    const tools = createMediaTools({
      paths: this.context.paths,
      designId: design.id,
      provider,
      budget,
      signal: controller.signal,
      jobId,
      originVariantId: variantId,
      librarySources: 'plugin-owned',
      // Provider queue states are useful for direct media actions, but they are
      // too low-level for the Design's single plain-English progress line.
      onProgress: createGenerationMediaProgressReporter(onProgress),
    });
    return { tools, budget };
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
  private async clearPendingRevision(target: {
    designId: string;
    variantId: string;
  }): Promise<void> {
    await mutateVariant(this.context.paths, target.designId, target.variantId, (variant) =>
      variant.pendingRevision === undefined ? null : { ...variant, pendingRevision: undefined },
    );
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
    naming: RevisionNaming & {
      /** Present when this run was a revise; decides what happens to the old one. */
      revision?: PendingRevision;
    },
  ): Promise<void> {
    const { paths } = this.context;
    const { revision, built } = await storeRevisionFiles(
      paths,
      design,
      target,
      job.id,
      files,
      naming,
    );

    if (!built) {
      await this.fail(
        job.id,
        target,
        revision.buildWarnings.join(' ') || 'The design could not be built into a preview.',
        revision,
      );
      return;
    }

    await markSucceeded(paths, job.id);
    await this.applyIfCurrent(
      job.id,
      target,
      (variant) => ({
        ...variant,
        status: 'ready',
        progress: undefined,
        error: undefined,
        attempts: variant.attempts + 1,
        // `replace` retires the revision it was asked to replace; `retain` leaves
        // it in the selector as a result of its own. Neither deletes anything —
        // a superseded revision keeps its files and can be made visible again,
        // which is what makes replacing recoverable (spec §6.4).
        revisions: [...applyRevisionBehaviour(variant.revisions, naming.revision), revision],
        visibleRevisionId: revision.id,
        pendingRevision: undefined,
        completedAt: Date.now(),
      }),
      'running',
    );
  }

  /**
   * Fail the variant, optionally recording what the run did produce. A failed
   * revision has no `builtFile`: there is nothing to preview, but the files it
   * names can be read, which is the difference between a failure you can look
   * into and one that only says it happened.
   */
  private async fail(
    jobId: string,
    target: { designId: string; variantId: string },
    reason: string,
    revision?: DesignRevision,
  ): Promise<void> {
    await markFailed(this.context.paths, jobId, reason);
    await this.applyIfCurrent(
      jobId,
      target,
      (variant) => ({
        ...variant,
        status: 'failed',
        progress: undefined,
        error: reason,
        attempts: variant.attempts + 1,
        completedAt: Date.now(),
        ...(revision === undefined
          ? {}
          : { revisions: [...variant.revisions, revision], visibleRevisionId: revision.id }),
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
      progress: undefined,
      completedAt: Date.now(),
    }));
  }
}
