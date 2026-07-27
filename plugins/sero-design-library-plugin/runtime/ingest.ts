import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { emptyAnalysis } from '../shared/librarian';
import type { DesignLibraryPaths } from '../shared/paths';
import { itemDir } from '../shared/paths';
import type { ItemRecord } from '../shared/records';
import { ITEM_SCHEMA_VERSION } from '../shared/records';
import { assembleUpload, discardUpload, readUploadManifest } from '../shared/uploads';
import { findByChecksum, readAllItems, saveItem } from './store';

/**
 * Turning a completed upload into a Library item.
 *
 * This is the only place an item is born from bytes, so duplicate detection,
 * asset layout and the initial analysis state are defined once for all three
 * import methods.
 */

export type IngestOutcome =
  | { status: 'created'; item: ItemRecord }
  | { status: 'duplicate'; item: ItemRecord }
  | { status: 'failed'; reason: string };

const EXTENSION_BY_MEDIA_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

function extensionFor(mediaType: string, fileName: string): string {
  const known = EXTENSION_BY_MEDIA_TYPE[mediaType];
  if (known) return known;
  const suffix = path.extname(fileName).replace('.', '').toLowerCase();
  return suffix === '' ? 'bin' : suffix;
}

/** A readable starting title, so an item is identifiable before analysis lands. */
function initialTitle(fileName: string): string {
  const base = path.basename(fileName, path.extname(fileName)).trim();
  if (base === '') return 'Untitled reference';
  return base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
}

export async function ingestUpload(
  paths: DesignLibraryPaths,
  uploadId: string,
): Promise<IngestOutcome> {
  const manifest = await readUploadManifest(paths, uploadId);
  if (!manifest) return { status: 'failed', reason: `Unknown upload ${uploadId}` };
  if (!manifest.complete) return { status: 'failed', reason: `Upload ${uploadId} was never completed` };

  const original = await assembleUpload(paths, uploadId, 'original');
  if (!original || original.byteLength === 0) {
    await discardUpload(paths, uploadId);
    return { status: 'failed', reason: `Upload ${uploadId} carried no data` };
  }

  const checksum = createHash('sha256').update(original).digest('hex');
  const existing = findByChecksum(await readAllItems(paths), checksum);
  if (existing) {
    // Importing an exact duplicate opens the existing item rather than
    // creating a second one (spec §5.2).
    await discardUpload(paths, uploadId);
    return { status: 'duplicate', item: existing };
  }

  // The renderer downscales before upload, so a missing preview means the
  // uploader chose not to send one — fall back to the original rather than
  // failing the import over a thumbnail.
  const preview = await assembleUpload(paths, uploadId, 'preview');
  const originalFile = `original.${extensionFor(manifest.mediaType, manifest.fileName)}`;
  const previewFile = preview
    ? `preview.${extensionFor(manifest.previewMediaType, 'preview.webp')}`
    : originalFile;

  const id = randomUUID();
  const dir = itemDir(paths, id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, originalFile), original);
  if (preview) await writeFile(path.join(dir, previewFile), preview);

  const now = Date.now();
  const item: ItemRecord = {
    id,
    schemaVersion: ITEM_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    kind: manifest.kind,
    source: {
      kind: manifest.sourceKind,
      fileName: manifest.fileName,
      ...(manifest.parentItemId === undefined ? {} : { parentItemId: manifest.parentItemId }),
    },
    asset: {
      originalFile,
      previewFile,
      mediaType: manifest.mediaType,
      bytes: original.byteLength,
      ...(manifest.width === undefined ? {} : { width: manifest.width }),
      ...(manifest.height === undefined ? {} : { height: manifest.height }),
      checksum,
    },
    profile: { generated: emptyAnalysis(initialTitle(manifest.fileName)), overrides: {} },
    analysis: { status: 'pending', attempts: 0 },
    favourite: false,
    collectionIds: [],
  };

  await saveItem(paths, item);
  await discardUpload(paths, uploadId);
  return { status: 'created', item };
}
