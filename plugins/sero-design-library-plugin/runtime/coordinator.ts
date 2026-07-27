import type { AppRuntimeHost } from '@sero-ai/common';

import { clearOverride, effectiveField, setOverride } from '../shared/librarian';
import type { DesignLibraryPaths } from '../shared/paths';
import { tombstoneFile } from '../shared/paths';
import type { TombstonedProvenance } from '../shared/records';
import type { LibraryRequest, LibraryRequestBody } from '../shared/requests';
import { pendingRequests, readState, updateState, writeJsonFile } from '../shared/state-io';
import type { DesignLibraryState } from '../shared/types';
import { AnalysisQueue } from './analysis-queue';
import { ingestUpload } from './ingest';
import { createJob, reconcileJobs, requestCancel } from './jobs';
import { destroyItem, mutateItem, readItem } from './store';

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
}

export class Coordinator {
  private readonly queue: AnalysisQueue;
  private draining = false;
  private drainAgain = false;

  constructor(private readonly context: CoordinatorContext) {
    this.queue = new AnalysisQueue({
      host: context.host,
      paths: context.paths,
      workspaceId: context.workspaceId,
      sessionId: context.sessionId,
      onError: context.onError,
    });
  }

  /** Resume interrupted work, then apply anything queued while we were away. */
  async start(): Promise<void> {
    const resumable = await reconcileJobs(this.context.paths);
    for (const job of resumable) {
      if (job.kind === 'analysis') this.queue.enqueue(job.id);
    }
    await this.drain();
  }

  async dispose(): Promise<void> {
    await this.queue.dispose();
  }

  /**
   * Apply every unconsumed request. Re-entrant calls coalesce into one more
   * pass, so a state change arriving mid-drain is never lost and never starts
   * a second concurrent drain.
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
        const requests = pendingRequests(state);
        for (const request of requests) {
          await this.applyOne(request);
        }
        if (requests.length > 0) await this.consume(requests);
      } while (this.drainAgain);
    } finally {
      this.draining = false;
    }
  }

  /** Advance the watermark and drop the requests it now covers. */
  private async consume(requests: LibraryRequest[]): Promise<void> {
    const highest = requests.reduce((max, request) => Math.max(max, request.id), 0);
    await updateState(this.context.paths, (current: DesignLibraryState) => ({
      ...current,
      consumedRequestId: Math.max(current.consumedRequestId, highest),
      requests: current.requests.filter((request) => request.id > highest),
    }));
  }

  private async applyOne(request: LibraryRequest): Promise<void> {
    try {
      await this.apply(request.body);
    } catch (error) {
      // One bad request must not stall the whole queue, so it is reported and
      // the watermark still advances past it.
      this.context.onError(`Request ${request.id} (${request.body.kind}) failed`, error);
    }
  }

  private async apply(body: LibraryRequestBody): Promise<void> {
    const { paths } = this.context;

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
        await mutateItem(paths, body.itemId, (item) => ({
          ...item,
          profile: setOverride(item.profile, body.field, body.value, Date.now()),
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

      case 'settings.update': {
        await updateState(paths, (current) => ({
          ...current,
          settings: { ...current.settings, ...body.patch },
        }));
        return;
      }

      case 'view.set': {
        await updateState(paths, (current) => ({
          ...current,
          view: { ...current.view, ...body.patch },
        }));
        return;
      }
    }
  }

  /** Queue analysis. Without `force`, an item that already has it is left alone. */
  private async startAnalysis(itemId: string, force: boolean): Promise<void> {
    const item = await readItem(this.context.paths, itemId);
    if (!item || item.deletedAt !== undefined) return;
    if (!force && (item.analysis.status === 'ready' || item.analysis.status === 'running')) return;

    const job = await createJob(this.context.paths, 'analysis', itemId);
    await mutateItem(this.context.paths, itemId, (current) => ({
      ...current,
      analysis: { ...current.analysis, status: 'pending', jobId: job.id, error: undefined },
    }));
    this.queue.enqueue(job.id);
  }

  private async cancelAnalysis(itemId: string): Promise<void> {
    const item = await readItem(this.context.paths, itemId);
    const jobId = item?.analysis.jobId;
    if (jobId === undefined) return;
    await requestCancel(this.context.paths, jobId);
    this.queue.cancel(jobId);
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
    const state = await readState(this.context.paths);
    const members = state.items.filter((item) => item.collectionIds.includes(collectionId));
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
