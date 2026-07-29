import type { DesignLibraryPaths } from '../shared/paths';
import type { LibraryRequestBody } from '../shared/requests';
import { updateState } from '../shared/state-io';
import { mutateDesign } from './design-store';
import {
  mutateGalleryFamily,
  purgeGalleryFamily,
  purgeGalleryVersion,
  readGalleryVersion,
} from './gallery-store';
import { saveGalleryVersion } from './gallery-snapshot';
import { checkpointTweaks } from './tweaks';
import { duplicateGalleryVersion } from './gallery-duplicate';

type GalleryRequestBody = Extract<LibraryRequestBody, { kind: `gallery.${string}` }>;

export function isGalleryRequest(body: LibraryRequestBody): body is GalleryRequestBody {
  return body.kind.startsWith('gallery.');
}

export class GalleryRequests {
  constructor(private readonly paths: DesignLibraryPaths) {}

  async apply(body: GalleryRequestBody): Promise<void> {
    switch (body.kind) {
      case 'gallery.save':
        await checkpointTweaks(this.paths, {
          designId: body.designId,
          variantId: body.variantId,
          revisionId: body.revisionId,
        });
        await saveGalleryVersion(this.paths, body);
        return;

      case 'gallery.feature':
        await mutateGalleryFamily(this.paths, body.familyId, (family) => {
          if (!family?.versions.some(
            (version) => version.id === body.versionId && version.deletedAt === undefined,
          )) return null;
          return { ...family, featuredVersionId: body.versionId };
        });
        return;

      case 'gallery.favourite':
        await mutateGalleryFamily(this.paths, body.familyId, (family) =>
          family ? { ...family, favourite: body.favourite } : null,
        );
        return;

      case 'gallery.open':
        await this.open(body.familyId, body.versionId);
        return;

      case 'gallery.duplicate': {
        const design = await duplicateGalleryVersion(this.paths, body);
        await updateState(this.paths, (state) => ({
          ...state,
          view: { ...state.view, selectedDesignId: design.id, activeVariantId: body.variantId },
        }));
        return;
      }

      case 'gallery.delete-version':
        await mutateGalleryFamily(this.paths, body.familyId, (family) => {
          if (!family) return null;
          const versions = family.versions.map((version) =>
            version.id === body.versionId
              ? { ...version, deletedAt: body.deleted ? Date.now() : undefined }
              : version,
          );
          const featured = versions.find((version) => version.id === family.featuredVersionId);
          const featuredVersionId = featured?.deletedAt === undefined
            ? family.featuredVersionId
            : versions.filter((version) => version.deletedAt === undefined).at(-1)?.id ?? family.featuredVersionId;
          return { ...family, versions, featuredVersionId };
        });
        return;

      case 'gallery.purge-version':
        await purgeGalleryVersion(this.paths, body.familyId, body.versionId);
        return;

      case 'gallery.delete-family':
        await mutateGalleryFamily(this.paths, body.familyId, (family) =>
          family
            ? { ...family, deletedAt: body.deleted ? Date.now() : undefined }
            : null,
        );
        return;

      case 'gallery.purge-family':
        await purgeGalleryFamily(this.paths, body.familyId);
        return;
    }
  }

  private async open(familyId: string, versionId: string): Promise<void> {
    const version = await readGalleryVersion(this.paths, familyId, versionId);
    if (!version) return;
    await checkpointTweaks(this.paths, {
      designId: version.sourceDesignId,
      variantId: version.sourceVariantId,
      revisionId: version.sourceRevisionId,
    });
    const design = await mutateDesign(this.paths, version.sourceDesignId, (current) => {
      const variant = current.variants.find((entry) => entry.id === version.sourceVariantId);
      if (!variant?.revisions.some((entry) => entry.id === version.sourceRevisionId)) return null;
      return {
        ...current,
        deletedAt: undefined,
        variants: current.variants.map((entry) =>
          entry.id === version.sourceVariantId
            ? {
                ...entry,
                visibleRevisionId: version.sourceRevisionId,
                revisions: entry.revisions.map((revision) =>
                  revision.id === version.sourceRevisionId
                    ? {
                        ...revision,
                        tweaks: {
                          overrides: version.tweakOverrides,
                          checkpoints: revision.tweaks?.checkpoints ?? [],
                        },
                      }
                    : revision,
                ),
              }
            : entry,
        ),
      };
    });
    if (!design) throw new Error('The source Design revision is no longer available.');
    await updateState(this.paths, (state) => ({
      ...state,
      view: {
        ...state.view,
        selectedDesignId: design.id,
        activeVariantId: version.sourceVariantId,
      },
    }));
  }
}
