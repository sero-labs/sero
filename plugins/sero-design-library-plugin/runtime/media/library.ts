import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { MediaAttempt, MediaCapability, StoredMediaRequest } from '../../shared/media';
import { kindFor } from '../../shared/media';
import type { DesignLibraryPaths } from '../../shared/paths';
import type { ItemRecord, ItemSourceKind } from '../../shared/records';
import { stageGeneratedUpload } from '../../shared/uploads';
import type { MediaSourceAsset } from './contract';
import { MediaError } from './contract';
import type { MediaBudget } from './budget';
import type { MediaProvider } from './contract';
import { executeMedia } from './execute';
import { originalPathFor, readItem } from '../store';

/**
 * Generating straight into the Library (spec §8.4, D3, D5).
 *
 * Two explicit actions, one implementation: **Generate inspiration** makes
 * something from a description, **Restyle/vary** makes something from an item
 * you already have. Both end as an ordinary Library item that analyses itself,
 * because the whole point is to feed the same loop an import feeds.
 *
 * The bytes take the import route rather than writing an item directly.
 * Duplicate detection, asset layout and the analysis kick-off live in
 * `ingestUpload`, and a second way to create an item is a second place for those
 * three to drift apart.
 */

export interface LibraryGenerationRequest {
  capability: MediaCapability;
  prompt: string;
  /** For Restyle/vary and upscale: the Library item to work from. */
  sourceItemId?: string;
  aspectRatio?: string;
  seed?: number;
  durationSeconds?: number;
}

export interface LibraryGenerationContext {
  paths: DesignLibraryPaths;
  provider: MediaProvider;
  budget: MediaBudget;
  signal: AbortSignal;
  /** Scratch directory the provider writes into before the item is staged. */
  directory: string;
  onProgress?(message: string): void;
}

export type LibraryGenerationOutcome =
  | { status: 'staged'; uploadId: string; attempt: MediaAttempt }
  | { status: 'failed'; attempt: MediaAttempt }
  | { status: 'refused'; reason: string };

function sourceResolver(paths: DesignLibraryPaths): (itemId: string) => Promise<MediaSourceAsset> {
  return async (itemId) => {
    const item = await readItem(paths, itemId);
    if (!item) {
      throw new MediaError('invalid-request', `There is no Library item ${itemId}.`, false);
    }
    const file = path.join(paths.home, originalPathFor(item));
    return { path: file, bytes: await readFile(file), mediaType: item.asset.mediaType };
  };
}

/**
 * A readable file name, so an item is identifiable before analysis lands.
 *
 * Derived from the prompt rather than the id: the grid shows the file name until
 * the Librarian has looked, and `a5f3…-0.png` says nothing about what it is.
 */
function fileNameFor(prompt: string, mediaType: string): string {
  const extension = mediaType.split('/')[1]?.split('+')[0] ?? 'png';
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, 6)
    .join('-');
  return `${words === '' ? 'generated' : words}.${extension}`;
}

export async function generateIntoLibrary(
  request: LibraryGenerationRequest,
  context: LibraryGenerationContext,
): Promise<LibraryGenerationOutcome> {
  const model = context.provider.defaultModel(request.capability);
  const decision = await context.budget.claim(request.capability, {
    prompt: request.prompt,
    model,
  });
  if (!decision.allowed) return { status: 'refused', reason: decision.reason };

  const stored: StoredMediaRequest = {
    capability: request.capability,
    prompt: request.prompt,
    ...(request.sourceItemId === undefined ? {} : { sourceAssetIds: [request.sourceItemId] }),
    ...(request.aspectRatio === undefined ? {} : { aspectRatio: request.aspectRatio }),
    ...(request.seed === undefined ? {} : { seed: request.seed }),
    ...(request.durationSeconds === undefined ? {} : { durationSeconds: request.durationSeconds }),
  };

  const attempt = await executeMedia(
    context.provider,
    { ...stored, model },
    {
      directory: context.directory,
      signal: context.signal,
      readAsset: sourceResolver(context.paths),
      ...(context.onProgress === undefined ? {} : { onProgress: context.onProgress }),
    },
  );

  if (attempt.provenance) context.budget.record(attempt.provenance);
  if (attempt.outcome !== 'ready' || attempt.file === undefined) {
    return { status: 'failed', attempt };
  }

  const bytes = await readFile(path.join(context.directory, attempt.file));
  const mediaType = attempt.mediaType ?? 'image/png';
  const kind = kindFor(request.capability);

  // `derived` when it came from an item the user already had, `generated` when
  // it came from a description alone — the two are different provenance and the
  // Library filters on the distinction.
  const sourceKind: ItemSourceKind = request.sourceItemId === undefined ? 'generated' : 'derived';

  const uploadId = await stageGeneratedUpload(context.paths, bytes, {
    fileName: fileNameFor(request.prompt, mediaType),
    mediaType,
    kind,
    sourceKind,
    previewMediaType: mediaType,
    ...(attempt.width === undefined ? {} : { width: attempt.width }),
    ...(attempt.height === undefined ? {} : { height: attempt.height }),
    ...(attempt.durationMs === undefined ? {} : { durationMs: attempt.durationMs }),
    ...(request.sourceItemId === undefined ? {} : { parentItemId: request.sourceItemId }),
    ...(attempt.provenance === undefined ? {} : { generation: attempt.provenance }),
    // A generated video has no thumbnail and nothing the Librarian can look at
    // until the renderer has decoded a frame for it.
    ...(kind === 'video' ? { awaitingFrames: true } : {}),
  });

  return { status: 'staged', uploadId, attempt };
}

/**
 * Copy a Design asset into the Library as an independent item (spec §6.6).
 *
 * Independent is the point: the new item owns its own bytes and carries its own
 * generation provenance, so deleting the Design it came from cannot alter it.
 */
export async function copyAssetToLibrary(
  paths: DesignLibraryPaths,
  source: { file: string; mediaType: string; prompt: string },
  provenance: ItemRecord['generation'],
  extra: { width?: number; height?: number; durationMs?: number } = {},
): Promise<string> {
  const bytes = await readFile(source.file);
  const kind = source.mediaType.startsWith('video/') ? 'video' : 'image';
  return stageGeneratedUpload(paths, bytes, {
    fileName: fileNameFor(source.prompt, source.mediaType),
    mediaType: source.mediaType,
    kind,
    sourceKind: 'generated',
    previewMediaType: source.mediaType,
    ...(extra.width === undefined ? {} : { width: extra.width }),
    ...(extra.height === undefined ? {} : { height: extra.height }),
    ...(extra.durationMs === undefined ? {} : { durationMs: extra.durationMs }),
    ...(provenance === undefined ? {} : { generation: provenance }),
    ...(kind === 'video' ? { awaitingFrames: true } : {}),
  });
}
