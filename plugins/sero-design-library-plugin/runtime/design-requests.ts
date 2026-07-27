import type { DesignLibraryPaths } from '../shared/paths';
import type { LibraryRequestBody } from '../shared/requests';
import { updateState } from '../shared/state-io';
import {
  cancelDesignWork,
  cancelVariant,
  createDesign,
  deleteDesign,
  deleteRevision,
  renameDesign,
  restoreDesign,
  retryVariant,
  reviseVariant,
  setVisibleRevision,
  startPendingVariants,
} from './designs';
import { readDesign } from './design-store';
import type { VariantQueue } from './generation/queue';
import { requestCancel } from './jobs';
import {
  checkpointTweaks,
  resetAllTweaks,
  resetTweak,
  restoreTweakCheckpoint,
  setTweak,
  type TweakTarget,
} from './tweaks';

/**
 * Everything the coordinator does with a `design.*` request.
 *
 * Split out from the coordinator itself because the Design surface is now the
 * larger half of the request log — creating, revising, choosing a revision and
 * setting tweak values — and the coordinator's job is the part that is the same
 * for every request: consume in order, exactly once, and never let one bad
 * request stall the queue.
 */

/** The request kinds handled here. */
type DesignRequestBody = Extract<LibraryRequestBody, { kind: `design.${string}` }>;

export function isDesignRequest(body: LibraryRequestBody): body is DesignRequestBody {
  return body.kind.startsWith('design.');
}

function tweakTarget(body: {
  designId: string;
  variantId: string;
  revisionId: string;
}): TweakTarget {
  return { designId: body.designId, variantId: body.variantId, revisionId: body.revisionId };
}

export class DesignRequests {
  constructor(
    private readonly paths: DesignLibraryPaths,
    private readonly variants: VariantQueue,
  ) {}

  async apply(body: DesignRequestBody, requestId: number): Promise<void> {
    const { paths } = this;

    switch (body.kind) {
      case 'design.create': {
        const outcome = await createDesign(paths, {
          designId: body.designId,
          title: body.title,
          brief: body.brief,
          referenceItemIds: body.referenceItemIds,
          resolutions: body.resolutions,
          sessionRules: body.sessionRules ?? [],
        });
        // A refusal is thrown rather than swallowed so it reaches the runtime's
        // error reporting; the request log has no channel back to the caller,
        // and the tool has already checked the same conditions synchronously.
        if (outcome.status === 'refused') throw new Error(outcome.reason);
        await updateState(paths, (current) => ({
          ...current,
          view: {
            ...current.view,
            selectedDesignId: outcome.design.id,
            activeVariantId: outcome.design.variants[0]?.id,
          },
        }));
        for (const jobId of await startPendingVariants(paths, outcome.design.id)) {
          this.variants.enqueue(jobId);
        }
        return;
      }

      case 'design.rename':
        await renameDesign(paths, body.designId, body.title);
        return;

      case 'design.retry-variant': {
        // The request id goes with it: applying a request and recording that it
        // was applied are two writes, so a crash between them replays this one,
        // and a retry that had already failed by then is retryable again. The
        // variant remembers the last request it acted on and declines the repeat.
        const jobId = await retryVariant(paths, body.designId, body.variantId, requestId);
        if (jobId !== null) this.variants.enqueue(jobId);
        return;
      }

      case 'design.revise-variant': {
        const jobId = await reviseVariant(
          paths,
          body.designId,
          body.variantId,
          body.instruction,
          body.behaviour,
          requestId,
        );
        if (jobId !== null) this.variants.enqueue(jobId);
        return;
      }

      case 'design.cancel-variant':
        await this.stopVariant(body.designId, body.variantId);
        return;

      case 'design.delete': {
        // Work stops before the record is hidden: a run that finishes afterwards
        // would write a revision into a Design the user has thrown away.
        // Aborting only asks it to stop, so each run is waited out — its last
        // writes land a tick later, after the abort call has returned.
        for (const jobId of await cancelDesignWork(paths, body.designId)) {
          await this.variants.cancel(jobId);
          await this.variants.settled(jobId);
        }
        await deleteDesign(paths, body.designId);
        return;
      }

      case 'design.restore':
        await restoreDesign(paths, body.designId);
        return;

      case 'design.set-visible-revision':
        await setVisibleRevision(paths, body.designId, body.variantId, body.revisionId);
        return;

      case 'design.delete-revision':
        await deleteRevision(paths, body.designId, body.variantId, body.revisionId);
        return;

      case 'design.set-tweak':
        await setTweak(paths, tweakTarget(body), body.controlId, body.value);
        return;

      case 'design.reset-tweak':
        await resetTweak(paths, tweakTarget(body), body.controlId);
        return;

      case 'design.reset-tweaks':
        await resetAllTweaks(paths, tweakTarget(body));
        return;

      case 'design.checkpoint-tweaks':
        await checkpointTweaks(paths, tweakTarget(body));
        return;

      case 'design.restore-tweaks':
        // The request id goes with it: a replay must not append a second copy of
        // the values it displaced.
        await restoreTweakCheckpoint(paths, tweakTarget(body), body.checkpointId, requestId);
        return;
    }
  }

  /**
   * Stop one variant. The job is asked to cancel before the queue aborts it, so a
   * run that had not started yet still finds the request when it does.
   */
  private async stopVariant(designId: string, variantId: string): Promise<void> {
    const design = await readDesign(this.paths, designId);
    const jobId = design?.variants.find((variant) => variant.id === variantId)?.jobId;
    if (jobId !== undefined) {
      await requestCancel(this.paths, jobId);
      await this.variants.cancel(jobId);
    }
    // Also written directly: a variant that never had a job — cancelled before
    // the runtime got to it — has nobody else to move it out of `pending`.
    await cancelVariant(this.paths, designId, variantId);
  }
}
