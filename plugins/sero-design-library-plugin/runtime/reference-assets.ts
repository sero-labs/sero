import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';

import { effectiveAnalysis } from '../shared/librarian';
import type { DesignAsset, MediaCapability } from '../shared/media';
import { assetReferenceFor } from '../shared/media';
import type { DesignLibraryPaths } from '../shared/paths';
import { designAssetDir } from '../shared/paths';
import type { ItemRecord } from '../shared/records';
import { originalPathFor } from './store';

/** Source kinds whose pixels belong to Design Library rather than an import. */
export function itemCanBeDesignArtwork(item: ItemRecord): boolean {
  return item.kind === 'image' &&
    (item.source.kind === 'generated' || item.source.kind === 'derived');
}

export function referenceAssetId(itemId: string): string {
  return `reference-${createHash('sha256').update(itemId).digest('hex').slice(0, 24)}`;
}

/**
 * Copy plugin-produced reference images into a new Design as independent assets.
 *
 * Imported references deliberately never enter this path. They remain
 * language-only, while generated and derived images become local artwork that
 * a page may use through its stable `assets/...` reference. The copy means
 * purging the Library item later cannot break the Design.
 */
export async function stageReferenceAssets(
  paths: DesignLibraryPaths,
  designId: string,
  items: ItemRecord[],
): Promise<DesignAsset[]> {
  const assets: DesignAsset[] = [];
  for (const item of items) {
    if (!itemCanBeDesignArtwork(item)) continue;

    const assetId = referenceAssetId(item.id);
    const directory = designAssetDir(paths, designId, assetId);
    const file = 'source';
    await mkdir(directory, { recursive: true });
    const temporary = path.join(directory, `.source.${randomUUID()}.tmp`);
    await copyFile(path.join(paths.home, originalPathFor(item)), temporary);
    await rename(temporary, path.join(directory, file));

    const now = Date.now();
    const generatedWith = item.generation?.capability;
    const capability: MediaCapability =
      generatedWith === undefined || generatedWith === 'text-to-video'
        ? 'text-to-image'
        : generatedWith;
    assets.push({
      id: assetId,
      kind: 'image',
      sourceItemId: item.id,
      reference: assetReferenceFor(assetId, capability),
      request: {
        capability,
        prompt: item.generation?.prompt ?? effectiveAnalysis(item.profile).title,
        ...(item.generation?.model === undefined ? {} : { model: item.generation.model }),
      },
      attempts: [
        {
          id: `source-${item.id}`,
          outcome: 'ready',
          startedAt: now,
          completedAt: now,
          file,
          mediaType: item.asset.mediaType,
          bytes: item.asset.bytes,
          ...(item.asset.width === undefined ? {} : { width: item.asset.width }),
          ...(item.asset.height === undefined ? {} : { height: item.asset.height }),
          ...(item.generation === undefined ? {} : { provenance: item.generation }),
        },
      ],
      createdAt: now,
      updatedAt: now,
    });
  }
  return assets;
}
