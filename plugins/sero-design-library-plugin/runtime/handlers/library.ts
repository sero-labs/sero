/**
 * Library request handlers: ingestion, field overrides and the deletion
 * lifecycle.
 *
 * Normal deletion hides an item and keeps its asset available. Permanent
 * deletion removes the original and its owned asset, and dependants keep
 * tombstoned provenance — deletion never cascades.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  designRecordPath,
  itemDir,
  itemRecordPath,
  uploadDir,
  type StoragePaths,
} from '../../shared/paths';
import { mutateRecord, readJsonFile, readRecord } from '../../shared/state-io';
import { newId } from '../../shared/ids';
import type { DesignRecord, LibraryItemRecord } from '../../shared/records';
import type { ImportSource } from '../../shared/records';
import type { LibrarianField, LibrarianUserFacingAnalysis } from '../../shared/types';
import { resolveLibrarianField } from '../../shared/schemas';
import type { RuntimeHost } from '../host';

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
};

interface UploadManifest {
  uploadId: string;
  fileName: string;
  mimeType: string;
  source: string;
  createdAt: number;
}

function importSource(value: string): ImportSource {
  return value === 'drag-drop' || value === 'clipboard' || value === 'generated-asset'
    ? value
    : 'file-picker';
}

/**
 * Move an upload into permanent item storage.
 *
 * The preview is the original file: images imported here are already bounded
 * by the upload limit, and Pi's read tool resizes before any model sees them,
 * so a second stored derivative would add cost without adding capability.
 */
export async function ingestUpload(
  host: RuntimeHost,
  payload: { uploadId: string; source: string; fileName: string },
): Promise<string> {
  const upload = uploadDir(host.paths, payload.uploadId);
  const manifest = await readJsonFile<UploadManifest>(path.join(upload, 'manifest.json'));
  if (!manifest) throw new Error(`Unknown upload ${payload.uploadId}.`);

  const bytes = await readFile(path.join(upload, 'payload.bin'));
  const checksum = createHash('sha256').update(bytes).digest('hex');

  const itemId = newId('itm', host.now());
  const dir = itemDir(host.paths, itemId);
  await mkdir(dir, { recursive: true });

  const extension = EXTENSION_BY_MIME[manifest.mimeType] ?? 'bin';
  const fileName = `original.${extension}`;
  await rename(path.join(upload, 'payload.bin'), path.join(dir, fileName));
  await rm(upload, { recursive: true, force: true });

  const asset = {
    fileName,
    mimeType: manifest.mimeType,
    byteLength: bytes.byteLength,
    checksum,
  };

  await mutateRecord<LibraryItemRecord>(itemRecordPath(host.paths, itemId), () => ({
    revision: 0,
    id: itemId,
    createdAt: host.now(),
    updatedAt: host.now(),
    source: importSource(payload.source),
    originalFileName: manifest.fileName,
    original: asset,
    preview: asset,
    analysisStatus: 'queued',
    analysisAttempts: 0,
  }));

  return itemId;
}

export async function applyFieldOverride(
  host: RuntimeHost,
  payload: { itemId: string; field: LibrarianField; value: unknown },
): Promise<void> {
  await mutateRecord<LibraryItemRecord>(itemRecordPath(host.paths, payload.itemId), (current) => {
    if (!current?.profile) throw new Error('That item has no analysis to override yet.');
    return {
      ...current,
      profile: {
        ...current.profile,
        overrides: {
          ...current.profile.overrides,
          [payload.field]: {
            field: payload.field,
            value: payload.value as LibrarianUserFacingAnalysis[LibrarianField],
            updatedAt: host.now(),
          },
        },
      },
      updatedAt: host.now(),
    };
  });
}

export async function resetFieldOverride(
  host: RuntimeHost,
  payload: { itemId: string; field: LibrarianField },
): Promise<void> {
  await mutateRecord<LibraryItemRecord>(itemRecordPath(host.paths, payload.itemId), (current) => {
    if (!current?.profile) throw new Error('That item has no analysis.');
    const overrides = { ...current.profile.overrides };
    delete overrides[payload.field];
    return {
      ...current,
      profile: { ...current.profile, overrides },
      updatedAt: host.now(),
    };
  });
}

export async function setItemDeleted(
  host: RuntimeHost,
  itemId: string,
  deleted: boolean,
): Promise<void> {
  await mutateRecord<LibraryItemRecord>(itemRecordPath(host.paths, itemId), (current) => {
    if (!current) throw new Error(`Unknown Library item ${itemId}.`);
    const next = { ...current, updatedAt: host.now() };
    if (deleted) return { ...next, deletedAt: host.now() };
    delete next.deletedAt;
    return next;
  });
}

/**
 * Permanent deletion. The item and its owned binary go; every Design that
 * referenced it keeps a tombstone carrying the identity and the metadata
 * needed to explain the missing source.
 */
export async function purgeItem(host: RuntimeHost, itemId: string): Promise<void> {
  const record = await readRecord<LibraryItemRecord>(itemRecordPath(host.paths, itemId));
  if (!record) return;

  const tombstone = {
    kind: 'tombstone' as const,
    sourceItemId: itemId,
    title: record.profile ? resolveLibrarianField(record.profile, 'title') : record.originalFileName,
    primaryStyle: record.profile ? resolveLibrarianField(record.profile, 'primaryStyle') : '',
    tags: record.profile ? resolveLibrarianField(record.profile, 'tags') : [],
    deletedAt: host.now(),
  };

  await tombstoneReferences(host.paths, itemId, tombstone, host.now());
  await rm(itemDir(host.paths, itemId), { recursive: true, force: true });
}

async function tombstoneReferences(
  paths: StoragePaths,
  itemId: string,
  tombstone: {
    kind: 'tombstone';
    sourceItemId: string;
    title: string;
    primaryStyle: string;
    tags: string[];
    deletedAt: number;
  },
  now: number,
): Promise<void> {
  const entries = await readdir(paths.designs, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const recordPath = designRecordPath(paths, entry.name);
    const design = await readJsonFile<DesignRecord>(recordPath);
    if (!design) continue;
    const affected = design.references.some(
      (reference) => reference.source.kind === 'live' && reference.source.itemId === itemId,
    );
    if (!affected) continue;

    await mutateRecord<DesignRecord>(recordPath, (current) => {
      if (!current) throw new Error(`Unknown Design ${entry.name}.`);
      return {
        ...current,
        references: current.references.map((reference) =>
          reference.source.kind === 'live' && reference.source.itemId === itemId
            ? { ...reference, source: tombstone }
            : reference),
        updatedAt: now,
      };
    });
  }
}

/** Copy a Design-owned generated asset into the Library as an independent item. */
export async function promoteAssetToLibrary(
  host: RuntimeHost,
  payload: { designId: string; assetId: string },
): Promise<string> {
  const design = await readRecord<DesignRecord>(designRecordPath(host.paths, payload.designId));
  const asset = design?.assets.find((entry) => entry.id === payload.assetId);
  if (!design || !asset) throw new Error(`Unknown asset ${payload.assetId}.`);

  const source = path.join(
    host.paths.designs,
    payload.designId,
    'assets',
    asset.id,
    asset.fileName,
  );
  const bytes = await readFile(source);
  const itemId = newId('itm', host.now());
  const dir = itemDir(host.paths, itemId);
  await mkdir(dir, { recursive: true });

  const extension = EXTENSION_BY_MIME[asset.mimeType] ?? 'png';
  const fileName = `original.${extension}`;
  await writeFile(path.join(dir, fileName), bytes);

  const stored = {
    fileName,
    mimeType: asset.mimeType,
    byteLength: bytes.byteLength,
    checksum: createHash('sha256').update(bytes).digest('hex'),
  };

  await mutateRecord<LibraryItemRecord>(itemRecordPath(host.paths, itemId), () => ({
    revision: 0,
    id: itemId,
    createdAt: host.now(),
    updatedAt: host.now(),
    source: 'generated-asset',
    originalFileName: asset.title,
    original: stored,
    preview: stored,
    analysisStatus: 'queued',
    analysisAttempts: 0,
    generationProvenance: asset.provenance,
  }));

  await mutateRecord<DesignRecord>(designRecordPath(host.paths, payload.designId), (current) => {
    if (!current) throw new Error(`Unknown Design ${payload.designId}.`);
    return {
      ...current,
      assets: current.assets.map((entry) =>
        entry.id === asset.id ? { ...entry, promotedItemId: itemId } : entry),
      updatedAt: host.now(),
    };
  });

  return itemId;
}
