import type { AppRuntimeHost } from '@sero-ai/common';
import { clearOverride, effectiveField, setOverride, validateFieldValue } from '../shared/librarian';
import { readIndex } from '../shared/index-storage';
import { normalizeItemIndex } from '../shared/indexes';
import type { DesignLibraryPaths } from '../shared/paths';
import { tombstoneFile } from '../shared/paths';
import type { JobKind, TombstonedProvenance } from '../shared/records';
import { itemTarget } from '../shared/records';
import type { LibraryRequest, LibraryRequestBody } from '../shared/requests';
import { pendingRequests, readState, updateState, writeJsonFile } from '../shared/state-io';
import type { MediaSettings } from '../shared/settings';
import type { DesignLibraryState } from '../shared/types';
import { applyViewPatch } from '../shared/types';
import { AnalysisQueue } from './analysis-queue';
import { DesignRequests, isDesignRequest } from './design-requests';
import { resumePendingVariants, startPendingVariants } from './designs';
import { VariantQueue } from './generation/queue';
import { ingestUpload } from './ingest';
import { createJob, reconcileJobs, requestCancel } from './jobs';
import { MediaQueue, type MediaQueueContext } from './media/queue';
import { attachFrames } from './frames';
import type { MediaProvider } from './media/contract';
import { mediaModelsChanged, refreshMediaOptions } from './media/options';
import { createMediaProviderForRun } from './media/provider';
import { MediaRequests, isMediaRequest } from './media/requests';
import { GalleryRequests, isGalleryRequest } from './gallery-requests';
import { ExportRequests, isExportRequest } from './export-requests';
import { destroyItem, dismissJob, mutateItem, readItem, readJob, scanItems } from './store';
/**
 * Applies intent submitted by extension tools.
 *
 * Requests are consumed in id order behind a monotonic watermark, so each one
 * is applied exactly once even if the runtime restarts mid-batch. A request
 * naming something that no longer exists is a no-op rather than an error —
 * intent is submitted asynchronously and the world may have moved on by the
 * time it is applied.
 */

export interface CoordinatorContext {
  host: AppRuntimeHost;
  paths: DesignLibraryPaths;
  workspaceId: string;
  sessionId: string;
  onError(message: string, error: unknown): void;
  /** Test and fault-injection seam; defaults to the shipped fal adapter. */
  createMediaProvider?: MediaQueueContext['createProvider'];
}

export class Coordinator {
  private readonly queue: AnalysisQueue;
  private readonly variants: VariantQueue;
  private readonly designs: DesignRequests;
  private readonly mediaQueue: MediaQueue;
  private readonly media: MediaRequests;
  private readonly gallery: GalleryRequests;
  private readonly exports: ExportRequests;
  private draining = false;
  private drainAgain = false;
  private readonly optionsRefreshes = new Set<Promise<void>>(); // Disposal waits for these writes.
  private readonly shutdown = new AbortController();

  constructor(private readonly context: CoordinatorContext) {
    const shared = {
      host: context.host,
      paths: context.paths,
      workspaceId: context.workspaceId,
      sessionId: context.sessionId,
      onError: context.onError,
    };
    this.queue = new AnalysisQueue(shared);
    this.variants = new VariantQueue(shared);
    this.designs = new DesignRequests(context.paths, this.variants);
    this.mediaQueue = new MediaQueue({
      host: context.host,
      paths: context.paths,
      onError: context.onError,
      // A generated Library item starts analysing itself, as an imported one
      // does. The kick-off stays here rather than in the queue, so there is one
      // place that decides when a new item starts being looked at.
      onItemCreated: (itemId) => this.startAnalysis(itemId, true),
      ...(context.createMediaProvider === undefined
        ? {}
        : { createProvider: context.createMediaProvider }),
    });
    this.media = new MediaRequests(context.paths, this.mediaQueue);
    this.gallery = new GalleryRequests(context.paths);
    this.exports = new ExportRequests(context.paths, context.host.workspace);
  }

  /** Resume interrupted work, then apply anything queued while we were away. */
  async start(): Promise<void> {
    const resumable = await reconcileJobs(this.context.paths);
    for (const job of resumable) this.route(job.kind, job.id);

    // Reconciliation repairs a variant that has a job. A variant left `pending`
    // with none — the process died between saving the Design and creating them —
    // is invisible to it, and nothing else ever looks at that variant again.
    for (const jobId of await resumePendingVariants(this.context.paths)) {
      this.variants.enqueue(jobId);
    }
    await this.resumeAbandonedAnalyses();

    await this.drain();

    // Deliberately last and deliberately not awaited: it reaches the network,
    // and nothing here should wait on a schema endpoint to resume work that is
    // already paid for. What it publishes only affects the pickers, and they
    // fall back until it lands.
    this.refreshMediaOptions();
  }

  /**
   * Publish what each capability's model accepts, for the UI's pickers.
   *
   * Fire and forget. A failure is reported and changes nothing: generation
   * settles against the provider itself, so it stays correct whether this ever
   * succeeded or not.
   */
  private refreshMediaOptions(): void {
    // Tracked so `dispose` can wait for it. It writes state, and a write landing
    // after the runtime is gone is the same hazard the generation queue tracks
    // its cancellations for.
    const pending = (async () => {
      const state = await readState(this.context.paths);
      const provider = await this.createProvider(state.settings.media);
      await refreshMediaOptions(this.context.paths, provider, this.shutdown.signal);
    })().catch((error: unknown) => {
      if (this.shutdown.signal.aborted) return;
      this.context.onError('Could not read what the media models accept', error);
    });
    this.optionsRefreshes.add(pending);
    void pending.finally(() => this.optionsRefreshes.delete(pending));
  }

  private async createProvider(settings: MediaSettings): Promise<MediaProvider> {
    const create = this.context.createMediaProvider ?? createMediaProviderForRun;
    return create(this.context.paths, settings);
  }

  async dispose(): Promise<void> {
    this.shutdown.abort();
    await Promise.all([
      this.queue.dispose(),
      this.variants.dispose(),
      this.mediaQueue.dispose(),
      ...this.optionsRefreshes,
    ]);
  }

  private route(kind: JobKind, jobId: string): void {
    if (kind === 'analysis') this.queue.enqueue(jobId);
    if (kind === 'generate') this.variants.enqueue(jobId);
    if (kind === 'media') this.mediaQueue.enqueue(jobId);
  }

  /**
   * Apply every unconsumed request. Re-entrant calls coalesce into one more
   * pass, so a state change arriving mid-drain is never lost and never starts
   * a second concurrent drain.
   *
   * The watermark advances after **each** request rather than after the batch.
   * Advancing per batch meant a crash part-way through replayed everything
   * already applied — most damagingly, queuing a second analysis job for an
   * item that had just been analysed.
   *
   * This is at-least-once, not exactly-once: a crash between applying a request
   * and recording it replays that one request. Every handler is therefore
   * idempotent — an ingest whose upload has already been consumed finds no
   * manifest, and the field, favourite, collection, deletion and settings
   * handlers all set values rather than accumulating them.
   */
  async drain(): Promise<void> {
    if (this.draining) {
      this.drainAgain = true;
      return;
    }
    this.draining = true;
    try {
      do {
        this.drainAgain = false;
        const state = await readState(this.context.paths);
        for (const request of pendingRequests(state)) {
          await this.applyOne(request);
          await this.consume(request);
        }
      } while (this.drainAgain);
    } finally {
      this.draining = false;
    }
  }

  /** Advance the watermark past one request and drop it from the log. */
  private async consume(request: LibraryRequest): Promise<void> {
    await updateState(this.context.paths, (current: DesignLibraryState) => ({
      ...current,
      consumedRequestId: Math.max(current.consumedRequestId, request.id),
      requests: current.requests.filter((entry) => entry.id > request.id),
    }));
  }

  private async applyOne(request: LibraryRequest): Promise<void> {
    try {
      await this.apply(request.body, request.id);
    } catch (error) {
      // One bad request must not stall the whole queue, so it is reported and
      // the watermark still advances past it.
      this.context.onError(`Request ${request.id} (${request.body.kind}) failed`, error);
    }
  }

  private async apply(body: LibraryRequestBody, requestId: number): Promise<void> {
    const { paths } = this.context;

    // The Design surface is the larger half of the request log and lives in its
    // own module; everything else is here.
    if (isDesignRequest(body)) {
      await this.designs.apply(body, requestId);
      return;
    }

    // Media has its own module for the same reason the Design surface does, and
    // hands back any item it created so the analysis kick-off stays in one place.
    if (isMediaRequest(body)) {
      const { analyse } = await this.media.apply(body);
      if (analyse !== undefined) await this.startAnalysis(analyse, true);
      return;
    }

    if (isGalleryRequest(body)) {
      await this.gallery.apply(body);
      return;
    }

    if (isExportRequest(body)) {
      await this.exports.apply(body);
      return;
    }

    switch (body.kind) {
      case 'ingest': {
        const outcome = await ingestUpload(paths, body.uploadId);
        if (outcome.status === 'failed') throw new Error(outcome.reason);
        if (outcome.status === 'created') {
          // A new reference appears in the grid and analyses behind it. It must
          // not open: opening is a navigation now, and importing twenty files
          // would otherwise throw the user into the twentieth one.
          await this.startAnalysis(outcome.item.id, true);
          return;
        }
        // A duplicate opens the item you already have (spec §5.2).
        await this.select(outcome.item.id);
        return;
      }

      case 'item.set-field': {
        // Validated at the tool too. Checked again here because the request log
        // is a file: anything that can write it can reach this handler, and a
        // malformed value would break the projection for that item.
        const checked = validateFieldValue(body.field, body.value);
        if (!checked.ok) throw new Error(checked.reason);
        await mutateItem(paths, body.itemId, (item) => ({
          ...item,
          profile: setOverride(item.profile, body.field, checked.value, Date.now()),
        }));
        return;
      }

      case 'item.reset-field': {
        await mutateItem(paths, body.itemId, (item) => ({
          ...item,
          profile: clearOverride(item.profile, body.field),
        }));
        return;
      }

      case 'item.favourite': {
        await mutateItem(paths, body.itemId, (item) => ({ ...item, favourite: body.favourite }));
        return;
      }

      case 'item.collect': {
        await mutateItem(paths, body.itemId, (item) => ({
          ...item,
          collectionIds: body.member
            ? [...new Set([...item.collectionIds, body.collectionId])]
            : item.collectionIds.filter((id) => id !== body.collectionId),
        }));
        return;
      }

      case 'item.delete': {
        // Normal deletion hides the item and stops any analysis it owns;
        // nothing on disk is removed until an explicit purge.
        await this.cancelAnalysis(body.itemId);
        await mutateItem(paths, body.itemId, (item) => ({ ...item, deletedAt: Date.now() }));
        return;
      }

      case 'item.restore': {
        await mutateItem(paths, body.itemId, (item) => ({ ...item, deletedAt: undefined }));
        return;
      }

      case 'item.purge': {
        await this.purge(body.itemId);
        return;
      }

      case 'analysis.run': {
        await this.startAnalysis(body.itemId, body.force);
        return;
      }

      case 'analysis.cancel': {
        await this.cancelAnalysis(body.itemId);
        return;
      }

      case 'collection.create': {
        await updateState(paths, (current) =>
          current.collections.some((entry) => entry.id === body.collectionId)
            ? null
            : {
                ...current,
                collections: [
                  ...current.collections,
                  { id: body.collectionId, name: body.name, colour: body.colour, createdAt: Date.now() },
                ],
              },
        );
        return;
      }

      case 'collection.rename': {
        await updateState(paths, (current) => ({
          ...current,
          collections: current.collections.map((entry) =>
            entry.id === body.collectionId ? { ...entry, name: body.name } : entry,
          ),
        }));
        return;
      }

      case 'collection.delete': {
        await this.deleteCollection(body.collectionId);
        return;
      }

      case 'frames.attach': {
        const outcome = await attachFrames(paths, body);
        // Forced, because the item is still sitting at `pending` — that is what
        // being held back looks like — and the unforced path reads `pending` as
        // "already queued" and does nothing. There is no job to displace: the
        // hold is exactly the absence of one.
        if (outcome.analyse !== undefined) await this.startAnalysis(outcome.analyse, true);
        return;
      }

      case 'job.dismiss': {
        // Idempotent: a job already forgotten, or one still running and so
        // refused, both leave nothing to do rather than failing the request.
        await dismissJob(paths, body.jobId);
        return;
      }

      case 'settings.update': {
        let modelsChanged = false;
        await updateState(paths, (current) => {
          const settings = { ...current.settings, ...body.patch };
          modelsChanged = mediaModelsChanged(current.settings.media, settings.media);
          return { ...current, settings };
        });
        // A new model id means new options — a different set of clip lengths,
        // possibly a different set of aspect ratios — and the pickers would
        // otherwise keep offering the old model's.
        if (modelsChanged) this.refreshMediaOptions();
        return;
      }

      case 'view.set': {
        await updateState(paths, (current) => ({
          ...current,
          view: applyViewPatch(current.view, body.patch),
        }));
        return;
      }
    }
  }

  /**
   * Queue analysis. Without `force`, an item that already has it is left alone.
   *
   * With `force`, any run already in flight is cancelled and waited for first.
   * Letting a second job start alongside the first meant two model calls for
   * one item, and whichever finished last won — so a reanalysis could be
   * silently overwritten by the run it was meant to replace.
   */
  /**
   * The same sweep the variants get, for items.
   *
   * An item waiting on a job nobody holds is a spinner that never stops:
   * reconciliation can only repair a target whose job it can still read, and
   * finished job records are swept after a day. Called after reconciliation, so
   * an item still `running` here belongs to a process that is gone.
   */
  private async resumeAbandonedAnalyses(): Promise<void> {
    const { items } = await scanItems(this.context.paths);
    for (const item of items) {
      if (item.deletedAt !== undefined) continue;
      if (item.analysis.status !== 'pending' && item.analysis.status !== 'running') continue;
      const job =
        item.analysis.jobId === undefined
          ? null
          : await readJob(this.context.paths, item.analysis.jobId);
      if (job?.status === 'queued' || job?.status === 'running') continue;
      await this.startAnalysis(item.id, true);
    }
  }

  private async startAnalysis(itemId: string, force: boolean): Promise<void> {
    const item = await readItem(this.context.paths, itemId);
    if (!item || item.deletedAt !== undefined) return;

    // A video with no frames is a video the Librarian cannot see. Running
    // anyway would produce a well-formed profile describing nothing — the same
    // failure the image tool's "was it called?" check exists to prevent — and
    // it would burn a model call doing it. The open app captures frames and
    // `frames.attach` starts this again.
    if (item.awaitingFrames === true) return;

    const busy = item.analysis.status === 'running' || item.analysis.status === 'pending';
    if (!force && (item.analysis.status === 'ready' || busy)) return;
    if (busy) await this.cancelAnalysis(itemId, { wait: true });

    const job = await createJob(this.context.paths, 'analysis', itemTarget(itemId));
    // Claiming the item for this job is what makes the queue's completion
    // check meaningful: a superseded job no longer matches and cannot write.
    await mutateItem(this.context.paths, itemId, (current) => ({
      ...current,
      analysis: { ...current.analysis, status: 'pending', jobId: job.id, error: undefined },
    }));
    this.queue.enqueue(job.id);
  }

  private async cancelAnalysis(itemId: string, options: { wait?: boolean } = {}): Promise<void> {
    const item = await readItem(this.context.paths, itemId);
    const jobId = item?.analysis.jobId;
    if (jobId === undefined) return;
    await requestCancel(this.context.paths, jobId);
    await this.queue.cancel(jobId);
    if (options.wait === true) await this.queue.settled(jobId);
  }

  /**
   * Permanent deletion removes the original and its owned assets, and leaves a
   * tombstone so dependants can explain what is missing. It never cascades.
   */
  private async purge(itemId: string): Promise<void> {
    const item = await readItem(this.context.paths, itemId);
    if (!item) return;
    await this.cancelAnalysis(itemId);

    const tombstone: TombstonedProvenance = {
      itemId,
      title: effectiveField(item.profile, 'title'),
      primaryStyle: effectiveField(item.profile, 'primaryStyle'),
      deletedAt: Date.now(),
    };
    await writeJsonFile(tombstoneFile(this.context.paths, itemId), tombstone);
    await destroyItem(this.context.paths, itemId);
  }

  /** Deleting a collection drops the grouping, never the items inside it. */
  private async deleteCollection(collectionId: string): Promise<void> {
    const items = await readIndex(this.context.paths.itemsIndexFile, normalizeItemIndex);
    const members = items.filter((item) => item.collectionIds.includes(collectionId));
    for (const member of members) {
      await mutateItem(this.context.paths, member.id, (item) => ({
        ...item,
        collectionIds: item.collectionIds.filter((id) => id !== collectionId),
      }));
    }
    await updateState(this.context.paths, (current) => ({
      ...current,
      collections: current.collections.filter((entry) => entry.id !== collectionId),
      view:
        current.view.scope.kind === 'collection' && current.view.scope.collectionId === collectionId
          ? { ...current.view, scope: { kind: 'all' } }
          : current.view,
    }));
  }

  private async select(itemId: string): Promise<void> {
    await updateState(this.context.paths, (current) => ({
      ...current,
      view: { ...current.view, selectedItemId: itemId },
    }));
  }
}
