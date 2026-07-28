import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import type { DesignRecord } from '../../shared/design';
import type { DesignAsset, MediaAttempt, StoredMediaRequest } from '../../shared/media';
import { assetReferenceFor, currentAttempt, kindFor } from '../../shared/media';
import type { DesignLibraryPaths } from '../../shared/paths';
import { designAssetDir } from '../../shared/paths';
import type { MediaSourceAsset } from './contract';
import { MediaError } from './contract';
import { mutateDesign, readDesign } from '../design-store';
import { originalPathFor, readItem } from '../store';

/**
 * Design assets as records (spec §6.6).
 *
 * The tray is a projection of these, and every mutation goes through the Design
 * record lock, because an asset lives inside `record.json` alongside the
 * variants — two assets finishing together would otherwise drop each other's
 * result, exactly as two variants would.
 */

/**
 * Reserve an asset before anything is generated.
 *
 * The record exists first so the tray can show the work in progress and so a
 * crash leaves something reconciliation can find. An asset with no attempts is
 * "nothing has come back yet"; whether that means running or abandoned is
 * decided by whether its job is still alive.
 */
export async function reserveAsset(
  paths: DesignLibraryPaths,
  designId: string,
  request: StoredMediaRequest,
  context: { jobId?: string; originVariantId?: string } = {},
  /**
   * The id to use, when the caller allocated one.
   *
   * An explicit action allocates it before the request is logged, so applying
   * that request twice finds the asset already there instead of reserving a
   * second one — and paying for it. A tool call inside a run has no such
   * problem and lets one be minted here.
   */
  assetId?: string,
): Promise<DesignAsset | null> {
  const id = assetId ?? randomUUID();
  const now = Date.now();
  const asset: DesignAsset = {
    id,
    kind: kindFor(request.capability),
    // The reference is fixed at reservation and never changes, so a retry that
    // produces different bytes does not orphan the `src` already written into
    // the page — which is what makes an asset-only retry work at all.
    reference: assetReferenceFor(id, request.capability),
    request,
    attempts: [],
    createdAt: now,
    updatedAt: now,
    ...(context.jobId === undefined ? {} : { jobId: context.jobId }),
    ...(context.originVariantId === undefined
      ? {}
      : { originVariantId: context.originVariantId }),
  };

  const updated = await mutateDesign(paths, designId, (design) => ({
    ...design,
    assets: [...design.assets, asset],
  }));
  return updated === null ? null : asset;
}

/**
 * Record what an attempt produced.
 *
 * Attempts append rather than replace: a successful retry changes what the tray
 * shows while the failure it replaced stays on the record, which is the whole of
 * "a successful retry replaces the placeholder and preserves history".
 */
export async function recordAttempt(
  paths: DesignLibraryPaths,
  designId: string,
  assetId: string,
  attempt: MediaAttempt,
): Promise<DesignAsset | null> {
  let stored: DesignAsset | null = null;
  await mutateDesign(paths, designId, (design) => {
    const asset = design.assets.find((entry) => entry.id === assetId);
    if (!asset) return null;
    // Replaying the same attempt must not append it twice: the request log is
    // applied at-least-once and an attempt id is what tells a repeat from a
    // genuine second try.
    if (asset.attempts.some((entry) => entry.id === attempt.id)) {
      stored = asset;
      return null;
    }
    // The reference is deliberately untouched. By the time an attempt lands the
    // model has already written `src="assets/<id>.png"` into the page, and a
    // reference that changed to match the bytes would break every page pointing
    // at it — including on a retry that merely came back as WebP instead of PNG.
    // The name is a key; the media type travels on the attempt.
    const next: DesignAsset = {
      ...asset,
      attempts: [...asset.attempts, attempt],
      jobId: undefined,
      updatedAt: Date.now(),
    };
    stored = next;
    return {
      ...design,
      assets: design.assets.map((entry) => (entry.id === assetId ? next : entry)),
    };
  });
  return stored;
}

/** Deletion hides the asset; the files stay until the Design is purged. */
export async function deleteAsset(
  paths: DesignLibraryPaths,
  designId: string,
  assetId: string,
  deleted: boolean,
): Promise<void> {
  await mutateDesign(paths, designId, (design) => ({
    ...design,
    assets: design.assets.map((asset) =>
      asset.id === assetId
        ? { ...asset, ...(deleted ? { deletedAt: Date.now() } : { deletedAt: undefined }) }
        : asset,
    ),
  }));
}

/** Permanent removal of one asset and every attempt's files. */
export async function purgeAsset(
  paths: DesignLibraryPaths,
  designId: string,
  assetId: string,
): Promise<void> {
  await mutateDesign(paths, designId, (design) =>
    design.assets.some((asset) => asset.id === assetId)
      ? { ...design, assets: design.assets.filter((asset) => asset.id !== assetId) }
      : null,
  );
  await rm(designAssetDir(paths, designId, assetId), { recursive: true, force: true });
}

/** Absolute path of the file an asset currently shows, or null when it has none. */
export function assetFilePath(
  paths: DesignLibraryPaths,
  designId: string,
  asset: DesignAsset,
): string | null {
  const attempt = currentAttempt(asset);
  if (attempt?.file === undefined) return null;
  return path.join(designAssetDir(paths, designId, asset.id), attempt.file);
}

/**
 * Resolve a source for image-to-image or upscale.
 *
 * Sources come from two places and the caller should not have to know which: an
 * id names either a sibling asset in this Design or a Library item. Asset first,
 * because within a Design that is the one the model just made.
 */
export function createSourceResolver(
  paths: DesignLibraryPaths,
  designId: string,
): (assetId: string) => Promise<MediaSourceAsset> {
  return async (assetId) => {
    const design = await readDesign(paths, designId);
    const asset = design?.assets.find((entry) => entry.id === assetId);
    if (asset) {
      const file = assetFilePath(paths, designId, asset);
      const attempt = currentAttempt(asset);
      if (file === null || attempt?.mediaType === undefined) {
        throw new MediaError('invalid-request', `Asset ${assetId} has no image to work from.`, false);
      }
      return { path: file, bytes: await readFile(file), mediaType: attempt.mediaType };
    }

    const item = await readItem(paths, assetId);
    if (!item) {
      throw new MediaError(
        'invalid-request',
        `There is no asset or Library item with id ${assetId}.`,
        false,
      );
    }
    const file = path.join(paths.home, originalPathFor(item));
    return { path: file, bytes: await readFile(file), mediaType: item.asset.mediaType };
  };
}

/**
 * Every asset a built page may refer to, as the build needs them.
 *
 * Only ready ones: a failed asset has no bytes, and a page pointing at it gets a
 * placeholder rather than a broken image (spec §6.6).
 */
export async function readAssetBytes(
  paths: DesignLibraryPaths,
  design: DesignRecord,
): Promise<{ reference: string; bytes: Uint8Array; mediaType: string }[]> {
  const resolved: { reference: string; bytes: Uint8Array; mediaType: string }[] = [];
  for (const asset of design.assets) {
    if (asset.deletedAt !== undefined) continue;
    const attempt = currentAttempt(asset);
    const file = assetFilePath(paths, design.id, asset);
    if (attempt?.outcome !== 'ready' || file === null || attempt.mediaType === undefined) continue;
    const bytes = await readFile(file).catch(() => null);
    if (bytes === null) continue;
    resolved.push({ reference: asset.reference, bytes, mediaType: attempt.mediaType });
  }
  return resolved;
}
