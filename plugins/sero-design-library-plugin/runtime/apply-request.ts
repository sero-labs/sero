/**
 * Applies one intent request.
 *
 * Every branch is a domain write performed by the runtime — the single
 * authoritative writer. Branches that own their own job lifecycle return
 * early; the rest fall through to one index republish.
 */

import type { DesignLibraryRequest } from '../shared/state';
import type { RequestMap } from '../shared/requests';
import type { Notice } from '../shared/state';
import type { JobStore } from './jobs';
import type { RuntimeHost } from './host';
import * as library from './handlers/library';
import * as design from './handlers/design';
import * as gallery from './handlers/gallery';
import { exportVersion } from './handlers/export';

/** The coordinator operations a request branch is allowed to reach for. */
export interface RequestContext {
  host: RuntimeHost;
  jobs: JobStore;
  republish(): Promise<void>;
  notice(level: Notice['level'], message: string, details?: string[]): Promise<void>;
  runAnalysis(itemId: string): Promise<void>;
  generate(input: RequestMap['design.generate']): Promise<void>;
  revise(input: RequestMap['design.revise']): Promise<void>;
  retryVariant(input: RequestMap['design.retry-variant']): Promise<void>;
  retryDesignAsset(input: RequestMap['design-asset.retry']): Promise<void>;
  softDeleteAsset(designId: string, assetId: string): Promise<void>;
}

export async function applyRequest(
ctx: RequestContext,
request: DesignLibraryRequest,
): Promise<void> {
  const payload = request.payload as never;

  switch (request.action) {
    case 'item.ingest-upload': {
      const itemId = await library.ingestUpload(ctx.host, payload as RequestMap['item.ingest-upload']);
      await ctx.republish();
      await ctx.runAnalysis(itemId);
      return;
    }
    case 'item.update-field':
      await library.applyFieldOverride(ctx.host, payload as RequestMap['item.update-field']);
      break;
    case 'item.reset-field':
      await library.resetFieldOverride(ctx.host, payload as RequestMap['item.reset-field']);
      break;
    case 'item.soft-delete':
      await library.setItemDeleted(ctx.host, (payload as RequestMap['item.soft-delete']).itemId, true);
      break;
    case 'item.restore':
      await library.setItemDeleted(ctx.host, (payload as RequestMap['item.restore']).itemId, false);
      break;
    case 'item.purge':
      await library.purgeItem(ctx.host, (payload as RequestMap['item.purge']).itemId);
      break;

    case 'analysis.run': {
      const input = payload as RequestMap['analysis.run'];
      await ctx.runAnalysis(input.itemId);
      return;
    }
    case 'analysis.cancel': {
      const input = payload as RequestMap['analysis.cancel'];
      const jobs = await ctx.jobs.list();
      const running = jobs.find((job) => job.ownerId === input.itemId && job.status === 'running');
      if (running) ctx.jobs.cancel(running.id);
      break;
    }

    case 'design.create':
      await design.createDesign(ctx.host, payload as RequestMap['design.create']);
      break;
    case 'design.generate':
      await ctx.generate(payload as RequestMap['design.generate']);
      return;
    case 'design.resolve-conflict':
      await design.resolveConflict(ctx.host, payload as RequestMap['design.resolve-conflict']);
      break;
    case 'design.revise':
      await ctx.revise(payload as RequestMap['design.revise']);
      return;
    case 'design.retry-variant':
      await ctx.retryVariant(payload as RequestMap['design.retry-variant']);
      return;
    case 'design.cancel-variant': {
      const input = payload as RequestMap['design.cancel-variant'];
      const jobs = await ctx.jobs.list();
      const running = jobs.find((job) => job.ownerId === input.variantId && job.status === 'running');
      if (running) ctx.jobs.cancel(running.id);
      await design.setVariantStatus(ctx.host, input.designId, input.variantId, 'cancelled');
      break;
    }
    case 'design.delete':
      await design.setDesignDeleted(ctx.host, (payload as RequestMap['design.delete']).designId, true);
      break;
    case 'design.restore':
      await design.setDesignDeleted(ctx.host, (payload as RequestMap['design.restore']).designId, false);
      break;

    case 'tweak.update':
      await design.updateTweaks(ctx.host, payload as RequestMap['tweak.update']);
      break;
    case 'tweak.reset':
      await design.resetTweaks(ctx.host, payload as RequestMap['tweak.reset']);
      break;
    case 'tweak.checkpoint':
      await design.checkpointTweaks(ctx.host, payload as RequestMap['tweak.checkpoint']);
      break;

    case 'design-asset.retry':
      await ctx.retryDesignAsset(payload as RequestMap['design-asset.retry']);
      return;
    case 'design-asset.delete': {
      const input = payload as RequestMap['design-asset.delete'];
      await ctx.softDeleteAsset(input.designId, input.assetId);
      break;
    }
    case 'design-asset.promote': {
      const itemId = await library.promoteAssetToLibrary(
        ctx.host,
        payload as RequestMap['design-asset.promote'],
      );
      await ctx.republish();
      await ctx.runAnalysis(itemId);
      return;
    }

    case 'gallery.save': {
      const saved = await gallery.saveGalleryVersion(ctx.host, payload as RequestMap['gallery.save']);
      await ctx.notice('info', `Saved to Gallery as version ${saved.versionId}.`);
      break;
    }
    case 'gallery.feature':
      await gallery.featureVersion(ctx.host, payload as RequestMap['gallery.feature']);
      break;
    case 'gallery.reopen': {
      const input = payload as RequestMap['gallery.reopen'];
      const designId = await gallery.reopenVersion(ctx.host, input);
      await ctx.host.updateState((current) => ({
        ...current,
        ui: { ...current.ui, activePage: 'design', activeDesignId: designId },
      }));
      break;
    }
    case 'gallery.duplicate':
      await gallery.duplicateFamily(ctx.host, payload as RequestMap['gallery.duplicate']);
      break;
    case 'gallery.remix': {
      const input = payload as RequestMap['gallery.remix'];
      await gallery.duplicateFamily(ctx.host, input);
      const designId = await gallery.reopenVersion(ctx.host, {
        familyId: input.familyId,
        versionId: input.versionId,
        designId: input.designId,
      });
      await ctx.host.updateState((current) => ({
        ...current,
        ui: { ...current.ui, activePage: 'design', activeDesignId: designId },
      }));
      break;
    }
    case 'gallery.delete':
      await gallery.setGalleryDeleted(ctx.host, payload as RequestMap['gallery.delete'], true);
      break;
    case 'gallery.restore':
      await gallery.setGalleryDeleted(ctx.host, payload as RequestMap['gallery.restore'], false);
      break;
    case 'gallery.purge':
      await gallery.purgeGallery(ctx.host, payload as RequestMap['gallery.purge']);
      break;

    case 'export.version': {
      const result = await exportVersion(ctx.host, payload as RequestMap['export.version']);
      await ctx.notice('info', `Exported to ${result.outputDir}.`);
      break;
    }

    case 'settings.update': {
      const input = payload as RequestMap['settings.update'];
      await ctx.host.updateState((current) => ({
        ...current,
        settings: {
          variantCount: (input.variantCount ?? current.settings.variantCount) as 1 | 2 | 3 | 4 | 5,
          revisionBehaviour: input.revisionBehaviour ?? current.settings.revisionBehaviour,
        },
      }));
      return;
    }

    case 'notice.dismiss': {
      const input = payload as RequestMap['notice.dismiss'];
      await ctx.host.updateState((current) => ({
        ...current,
        notices: current.notices.filter((entry) => entry.id !== input.noticeId),
      }));
      return;
    }

    default:
      ctx.host.log(`Ignoring unknown request ${request.action}.`);
      return;
  }

  await ctx.republish();
}
