/**
 * The Design Library runtime coordinator.
 *
 * Push model — no timers. Work arrives as requests appended to the reactive
 * index by extension tools; `handleStateChange` drains them. The coordinator
 * is the single authoritative writer for every record and for the index.
 */

import { mkdir } from 'node:fs/promises';

import { designRecordPath, itemRecordPath } from '../shared/paths';
import { mutateRecord, readRecord } from '../shared/state-io';
import { newId } from '../shared/ids';
import {
  pendingRequests,
  type DesignLibraryRequest,
  type DesignLibraryState,
  type Notice,
} from '../shared/state';
import type { RequestMap } from '../shared/requests';
import type { DesignRecord, JobRecord, LibraryItemRecord } from '../shared/records';
import type { RuntimeHost } from './host';
import { applyRequest, type RequestContext } from './apply-request';
import { JobStore } from './jobs';
import { projectDesigns, projectFamilies, projectItems } from './projection';
import { analyseItem } from './librarian/analyse';
import { generateVariant, type GenerationDeps } from './generation/generate';
import * as library from './handlers/library';
import * as design from './handlers/design';
import * as gallery from './handlers/gallery';
import { exportVersion } from './handlers/export';
import { retryAsset } from './handlers/assets';

export class DesignLibraryCoordinator {
  private readonly jobs: JobStore;
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(
    private readonly host: RuntimeHost,
    private readonly deps: GenerationDeps,
  ) {
    this.jobs = new JobStore(host.paths, host.now);
  }

  async start(): Promise<void> {
    const paths = this.host.paths;
    await Promise.all(
      [paths.items, paths.designs, paths.gallery, paths.jobs, paths.uploads].map((dir) =>
        mkdir(dir, { recursive: true })),
    );

    const resumable = await this.jobs.reconcile();
    await this.republish();

    for (const job of resumable) {
      this.enqueue(() => this.resume(job));
    }
    // Anything queued while Sero was closed is still in the request log.
    await this.handleStateChange(await this.host.readState());
  }

  async handleStateChange(raw: unknown): Promise<void> {
    if (this.disposed) return;
    const state = raw as DesignLibraryState | null;
    if (!state || !Array.isArray(state.requests)) return;

    const requests = pendingRequests(state);
    if (requests.length === 0) return;

    const watermark = requests[requests.length - 1].id;
    await this.host.updateState((current) => ({
      ...current,
      consumedRequestId: Math.max(current.consumedRequestId, watermark),
      requests: current.requests.filter((entry) => entry.id > watermark),
    }));

    for (const request of requests) {
      this.enqueue(() => applyRequest(this.requestContext(), request));
    }
  }

  /** The narrow surface a request branch may reach for. */
  private requestContext(): RequestContext {
    return {
      host: this.host,
      jobs: this.jobs,
      republish: () => this.republish(),
      notice: (level, message, details) => this.notice(level, message, details),
      runAnalysis: (itemId) => this.runAnalysis(itemId),
      generate: (input) => this.generate(input),
      revise: (input) => this.revise(input),
      retryVariant: (input) => this.retryVariant(input),
      retryDesignAsset: (input) => this.retryDesignAsset(input),
      softDeleteAsset: (designId, assetId) => this.softDeleteAsset(designId, assetId),
    };
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.jobs.cancelAll();
    await this.checkpointOpenTweakSessions();
  }

  /**
   * Resolves once the work queue drains, including work that queued more work
   * (a generation run enqueues one job per variant).
   */
  async idle(): Promise<void> {
    let settled = this.queue;
    do {
      settled = this.queue;
      await settled;
    } while (settled !== this.queue);
  }

  private enqueue(work: () => Promise<void>): void {
    this.queue = this.queue.then(async () => {
      if (this.disposed) return;
      try {
        await work();
      } catch (error) {
        await this.notice('error', error instanceof Error ? error.message : String(error));
      }
    });
  }


  // ── Work units ─────────────────────────────────────────────

  private async runAnalysis(itemId: string): Promise<void> {
    const job = await this.jobs.create({
      kind: 'librarian',
      ownerId: itemId,
      label: 'Librarian analysis',
      payload: { itemId },
    });
    await this.runJob(job, async (signal) => {
      await analyseItem(this.host, { itemId, signal });
    });
  }

  private async generate(input: RequestMap['design.generate']): Promise<void> {
    const record = await readRecord<DesignRecord>(designRecordPath(this.host.paths, input.designId));
    if (!record) throw new Error(`Unknown Design ${input.designId}.`);

    const blocking = design.unresolvedConflicts(record);
    if (blocking.length > 0) {
      await this.notice(
        'warning',
        'Generation is blocked by incompatible guardrails.',
        blocking.map((conflict) => `"${conflict.always}" conflicts with "${conflict.never}"`),
      );
      return;
    }

    const references = await design.loadReferenceProfiles(this.host, record);
    if (references.length === 0) {
      await this.notice('warning', 'No analysed reference is available for this Design yet.');
      return;
    }

    const count = Math.min(5, Math.max(1, input.variantCount));
    for (let index = 0; index < count; index += 1) {
      const variantId = newId('var', this.host.now());
      await design.upsertVariant(this.host, input.designId, {
        id: variantId,
        title: `Variant ${index + 1}`,
        status: 'queued',
        revisions: [],
      });
      this.enqueue(() => this.runVariant({
        designId: input.designId,
        variantId,
        variantIndex: index,
        variantCount: count,
        references,
        request: record.request,
        outputTarget: record.outputTarget,
      }));
    }
    await this.republish();
  }

  private async runVariant(input: {
    designId: string;
    variantId: string;
    variantIndex: number;
    variantCount: number;
    references: Awaited<ReturnType<typeof design.loadReferenceProfiles>>;
    request: string;
    outputTarget: DesignRecord['outputTarget'];
    revision?: { instruction: string; files: DesignRecord['variants'][number]['revisions'][number]['files'] };
    behaviour?: 'replace' | 'retain';
  }): Promise<void> {
    const job = await this.jobs.create({
      kind: 'variant',
      ownerId: input.variantId,
      scopeId: input.designId,
      label: `Variant ${input.variantIndex + 1}`,
      payload: { ...input, references: undefined },
    });

    await design.setVariantStatus(this.host, input.designId, input.variantId, 'running');

    await this.runJob(job, async (signal) => {
      const produced = await generateVariant(this.host, this.deps, {
        designId: input.designId,
        variantId: input.variantId,
        variantIndex: input.variantIndex,
        variantCount: input.variantCount,
        references: input.references,
        request: input.request,
        outputTarget: input.outputTarget,
        ...(input.revision ? { revision: input.revision } : {}),
        signal,
      });

      await design.attachRevision(
        this.host,
        input.designId,
        input.variantId,
        produced.revision,
        input.behaviour ?? 'replace',
      );
      await design.setVariantTitle(this.host, input.designId, input.variantId, produced.title);

      if (produced.revision.droppedTweakControls.length > 0) {
        await this.notice(
          'warning',
          `${produced.revision.droppedTweakControls.length} tweak controls were removed because they would not have worked.`,
          produced.revision.droppedTweakControls.map((entry) => `${entry.label}: ${entry.reason}`),
        );
      }
      for (const warning of produced.previewWarnings) {
        await this.notice('warning', warning);
      }
    }, async (message, cancelled) => {
      await design.setVariantStatus(
        this.host,
        input.designId,
        input.variantId,
        cancelled ? 'cancelled' : 'failed',
        message,
      );
    });
  }

  private async revise(input: RequestMap['design.revise']): Promise<void> {
    const record = await readRecord<DesignRecord>(designRecordPath(this.host.paths, input.designId));
    if (!record) throw new Error(`Unknown Design ${input.designId}.`);
    const variant = record.variants.find((entry) => entry.id === input.variantId);
    const current = variant?.revisions.find((entry) => entry.id === variant.visibleRevisionId);
    if (!variant || !current) throw new Error('That variant has no visible revision to revise.');

    // A pending tweak session is checkpointed first so the revision starts
    // from a saved, recoverable state.
    await design.checkpointTweaks(this.host, {
      designId: input.designId,
      variantId: input.variantId,
      reason: 'revision-started',
    });

    const references = await design.loadReferenceProfiles(this.host, record);
    await this.runVariant({
      designId: input.designId,
      variantId: input.variantId,
      variantIndex: record.variants.indexOf(variant),
      variantCount: record.variants.length,
      references,
      request: record.request,
      outputTarget: record.outputTarget,
      revision: { instruction: input.instruction, files: current.files },
      behaviour: input.behaviour,
    });
  }

  private async retryVariant(input: RequestMap['design.retry-variant']): Promise<void> {
    const record = await readRecord<DesignRecord>(designRecordPath(this.host.paths, input.designId));
    if (!record) throw new Error(`Unknown Design ${input.designId}.`);
    const variant = record.variants.find((entry) => entry.id === input.variantId);
    if (!variant) throw new Error(`Unknown variant ${input.variantId}.`);

    const references = await design.loadReferenceProfiles(this.host, record);
    await this.runVariant({
      designId: input.designId,
      variantId: input.variantId,
      variantIndex: record.variants.indexOf(variant),
      variantCount: record.variants.length,
      references,
      request: record.request,
      outputTarget: record.outputTarget,
    });
  }

  private async retryDesignAsset(input: RequestMap['design-asset.retry']): Promise<void> {
    const job = await this.jobs.create({
      kind: 'generated-asset',
      ownerId: input.assetId,
      scopeId: input.designId,
      label: 'Artwork retry',
      payload: { ...input },
    });
    await this.runJob(job, async (signal) => {
      const result = await retryAsset(this.host, this.deps.registry, { ...input, signal });
      if (!result.replaced) {
        await this.notice('warning', `Artwork retry failed: ${result.message}`);
      }
    });
  }

  private async softDeleteAsset(designId: string, assetId: string): Promise<void> {
    await mutateRecord<DesignRecord>(designRecordPath(this.host.paths, designId), (current) => {
      if (!current) throw new Error(`Unknown Design ${designId}.`);
      return {
        ...current,
        assets: current.assets.map((asset) =>
          asset.id === assetId ? { ...asset, deletedAt: this.host.now() } : asset),
        updatedAt: this.host.now(),
      };
    });
  }

  private async resume(job: JobRecord): Promise<void> {
    if (job.kind === 'librarian') {
      const item = await readRecord<LibraryItemRecord>(
        itemRecordPath(this.host.paths, job.ownerId),
      );
      if (!item || item.analysisStatus === 'ready') return;
      await this.runAnalysis(job.ownerId);
      return;
    }
    if (job.kind === 'variant' && typeof job.scopeId === 'string') {
      await this.retryVariant({ designId: job.scopeId, variantId: job.ownerId });
    }
  }

  // ── Plumbing ───────────────────────────────────────────────

  private async runJob(
    job: JobRecord,
    work: (signal: AbortSignal) => Promise<void>,
    onFailure?: (message: string, cancelled: boolean) => Promise<void>,
  ): Promise<void> {
    const signal = this.jobs.signal(job.id);
    await this.jobs.update(job.id, 'running');
    await this.republish();

    try {
      await work(signal);
      await this.jobs.update(job.id, 'succeeded');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const cancelled = signal.aborted || message.startsWith('Aborted');
      await this.jobs.update(job.id, cancelled ? 'cancelled' : 'failed', message);
      await onFailure?.(message, cancelled);
      if (!cancelled) await this.notice('error', `${job.label} failed: ${message}`);
    } finally {
      this.jobs.release(job.id);
      await this.jobs.prune();
      await this.republish();
    }
  }

  /** Rebuild the reactive index from the records on disk. */
  private async republish(): Promise<void> {
    const [items, designs, families, jobs] = await Promise.all([
      projectItems(this.host.paths),
      projectDesigns(this.host.paths),
      projectFamilies(this.host.paths),
      this.jobs.list(),
    ]);

    await this.host.updateState((current) => ({
      ...current,
      items,
      designs,
      families,
      jobs: jobs
        .filter((job) => job.status !== 'succeeded')
        .map((job) => ({
          id: job.id,
          kind: job.kind,
          ownerId: job.ownerId,
          ...(job.scopeId ? { scopeId: job.scopeId } : {}),
          status: job.status,
          attempt: job.attempt,
          label: job.label,
          ...(job.errorMessage ? { errorMessage: job.errorMessage } : {}),
          updatedAt: job.updatedAt,
        })),
    }));
  }

  private async notice(level: Notice['level'], message: string, details?: string[]): Promise<void> {
    await this.host.updateState((current) => ({
      ...current,
      notices: [
        ...current.notices.slice(-19),
        {
          id: newId('ntc', this.host.now()),
          level,
          message,
          ...(details ? { details } : {}),
          createdAt: this.host.now(),
        },
      ],
    }));
  }

  /** Shutdown is a tweak checkpoint boundary. */
  private async checkpointOpenTweakSessions(): Promise<void> {
    const designs = await projectDesigns(this.host.paths);
    for (const summary of designs) {
      const record = await readRecord<DesignRecord>(designRecordPath(this.host.paths, summary.id));
      if (!record) continue;
      for (const variant of record.variants) {
        if (!variant.tweakWorking?.dirty) continue;
        await design.checkpointTweaks(this.host, {
          designId: record.id,
          variantId: variant.id,
          reason: 'shutdown',
        }).catch(() => undefined);
      }
    }
  }
}
