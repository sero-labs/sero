import path from 'node:path';

import type { DesignAsset } from '../../shared/media';
import { currentAttempt } from '../../shared/media';
import type { DesignLibraryPaths } from '../../shared/paths';
import { designAssetDir } from '../../shared/paths';
import { assetTarget, libraryTarget, type MediaJobRequest } from '../../shared/records';
import type { LibraryRequestBody } from '../../shared/requests';
import { mutateDesign, readDesign } from '../design-store';
import { ingestUpload } from '../ingest';
import { createJob } from '../jobs';
import { listJobs } from '../store';
import { deleteAsset, purgeAsset, reserveAsset } from './assets';
import { copyAssetToLibrary } from './library';
import type { MediaQueue } from './queue';

/**
 * Everything the coordinator does with a `media.*` or `library.generate`
 * request.
 *
 * Split out for the same reason the Design requests are: the coordinator's job
 * is the part that is the same for every request — consume in order, exactly
 * once, never let one bad request stall the queue — and this is the part that is
 * specific to media.
 *
 * Every handler here is idempotent, because the request log is applied
 * at-least-once. Ids arrive from the caller rather than being minted here, so a
 * replay finds the work already reserved instead of reserving it, and paying
 * for it, a second time.
 */

type MediaRequestBody = Extract<
  LibraryRequestBody,
  { kind: `media.${string}` } | { kind: 'library.generate' }
>;

export function isMediaRequest(body: LibraryRequestBody): body is MediaRequestBody {
  return body.kind.startsWith('media.') || body.kind === 'library.generate';
}

export class MediaRequests {
  constructor(
    private readonly paths: DesignLibraryPaths,
    private readonly queue: MediaQueue,
  ) {}

  /**
   * Apply one request, and say whether it produced an item that needs analysing.
   *
   * The analysis kick-off stays with the coordinator, which owns it for every
   * other route into the Library; handing back the id keeps one place deciding
   * when a new item starts being looked at.
   */
  async apply(body: MediaRequestBody): Promise<{ analyse?: string }> {
    const { paths } = this;

    switch (body.kind) {
      case 'media.generate': {
        // The caller's asset id is what makes this replay-safe: a second
        // application finds the asset already there and does nothing, rather
        // than reserving a second one and paying for it.
        const design = await readDesign(paths, body.designId);
        if (!design || design.deletedAt !== undefined) return {};
        if (design.assets.some((asset) => asset.id === body.assetId)) return {};

        const job = await createJob(paths, 'media', assetTarget(body.designId, body.assetId));
        await reserveAsset(paths, body.designId, body.request, { jobId: job.id }, body.assetId);
        this.queue.enqueue(job.id);
        return {};
      }

      case 'media.retry': {
        const asset = await this.readAsset(body.designId, body.assetId);
        // Already working: a second Retry press while one is in flight must not
        // start a second paid call for the same asset.
        if (!asset || asset.jobId !== undefined) return {};

        const job = await createJob(paths, 'media', assetTarget(body.designId, body.assetId));
        await mutateDesign(paths, body.designId, (design) => ({
          ...design,
          assets: design.assets.map((entry) =>
            entry.id === body.assetId ? { ...entry, jobId: job.id } : entry,
          ),
        }));
        this.queue.enqueue(job.id);
        return {};
      }

      case 'media.delete':
        await deleteAsset(paths, body.designId, body.assetId, body.deleted);
        return {};

      case 'media.purge': {
        const asset = await this.readAsset(body.designId, body.assetId);
        if (asset?.jobId !== undefined) await this.queue.cancel(asset.jobId);
        await purgeAsset(paths, body.designId, body.assetId);
        return {};
      }

      case 'media.copy-to-library':
        return this.copyToLibrary(body.designId, body.assetId);

      case 'library.generate': {
        // Keyed on the slot id for the same reason: a replay finds the job.
        if (await this.slotHasJob(body.slotId)) return {};

        const media: MediaJobRequest = {
          capability: body.capability,
          prompt: body.prompt,
          ...(body.sourceItemId === undefined ? {} : { sourceItemId: body.sourceItemId }),
          ...(body.aspectRatio === undefined ? {} : { aspectRatio: body.aspectRatio }),
          ...(body.seed === undefined ? {} : { seed: body.seed }),
          ...(body.durationSeconds === undefined ? {} : { durationSeconds: body.durationSeconds }),
        };
        // One write, not two: a job saved without its request would be a slot
        // nothing can ever generate, and the replay guard above would keep it
        // that way.
        const job = await createJob(paths, 'media', libraryTarget(body.slotId), media);
        this.queue.enqueue(job.id);
        return {};
      }
    }
  }

  private async readAsset(designId: string, assetId: string): Promise<DesignAsset | null> {
    const design = await readDesign(this.paths, designId);
    return design?.assets.find((asset) => asset.id === assetId) ?? null;
  }

  /** True when a job already owns this slot, so a replay does not start a second. */
  private async slotHasJob(slotId: string): Promise<boolean> {
    const jobs = await listJobs(this.paths);
    return jobs.some((job) => job.target.kind === 'library' && job.target.slotId === slotId);
  }

  /**
   * Make an independent Library item from a tray asset (spec §6.6).
   *
   * Independent, so the item owns its own copy of the bytes and its own
   * provenance: deleting the Design, or the asset, cannot alter it afterwards.
   * The Design remembers which item it produced, so the tray can say "already
   * copied" rather than making a second one every time the button is pressed.
   */
  private async copyToLibrary(designId: string, assetId: string): Promise<{ analyse?: string }> {
    const asset = await this.readAsset(designId, assetId);
    // Copying twice would make a second item saying the same thing, and the
    // request log is applied at-least-once — so this is the replay guard too.
    if (!asset || asset.copiedItemId !== undefined) return {};

    const attempt = currentAttempt(asset);
    if (attempt?.outcome !== 'ready' || attempt.file === undefined) return {};

    const uploadId = await copyAssetToLibrary(
      this.paths,
      {
        file: path.join(designAssetDir(this.paths, designId, assetId), attempt.file),
        mediaType: attempt.mediaType ?? 'image/png',
        prompt: asset.request.prompt,
      },
      attempt.provenance,
      {
        ...(attempt.width === undefined ? {} : { width: attempt.width }),
        ...(attempt.height === undefined ? {} : { height: attempt.height }),
        ...(attempt.durationMs === undefined ? {} : { durationMs: attempt.durationMs }),
      },
    );

    // Ingested here rather than queued as another request, because the *item id*
    // is what the tray records — and queuing would mean the copy finished
    // without knowing what it had produced. Duplicate detection still applies:
    // copying something already in the Library links the item that is there
    // rather than making a second one (spec §5.2).
    const outcome = await ingestUpload(this.paths, uploadId);
    if (outcome.status === 'failed') throw new Error(outcome.reason);

    await mutateDesign(this.paths, designId, (design) => ({
      ...design,
      assets: design.assets.map((entry) =>
        entry.id === assetId ? { ...entry, copiedItemId: outcome.item.id } : entry,
      ),
    }));
    // Only a newly created item needs looking at; a duplicate has been analysed.
    return outcome.status === 'created' ? { analyse: outcome.item.id } : {};
  }
}
