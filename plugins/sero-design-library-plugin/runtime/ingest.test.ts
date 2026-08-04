import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../shared/paths';
import { readStateWithIndexes } from '../shared/state-io';
import { beginUpload, completeUpload, pruneStaleUploads, writeUploadChunk } from '../shared/uploads';
import type { UploadManifest } from '../shared/uploads';
import { ingestUpload } from './ingest';
import { readAllItems } from './store';

let home: string;
let paths: DesignLibraryPaths;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-ingest-'));
  paths = designLibraryPathsFromHome(home);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function manifestFor(id: string, fileName: string): UploadManifest {
  return {
    id,
    fileName,
    mediaType: 'image/png',
    kind: 'image',
    sourceKind: 'file',
    chunkCounts: { original: 1, preview: 1 },
    previewMediaType: 'image/webp',
    createdAt: Date.now(),
    complete: false,
  };
}

/** Push one file through the same route all three import methods take. */
async function upload(id: string, fileName: string, content: string, previewContent = 'preview'): Promise<void> {
  await beginUpload(paths, manifestFor(id, fileName));
  await writeUploadChunk(paths, id, 'original', 0, Buffer.from(content).toString('base64'));
  await writeUploadChunk(paths, id, 'preview', 0, Buffer.from(previewContent).toString('base64'));
  await completeUpload(paths, id);
}

describe('ingestUpload', () => {
  it('creates an item that is pending analysis and indexed', async () => {
    await upload('u1', 'Northstar Operations.png', 'original-bytes');
    const outcome = await ingestUpload(paths, 'u1');

    expect(outcome.status).toBe('created');
    if (outcome.status !== 'created') return;
    expect(outcome.item.analysis.status).toBe('pending');
    expect(outcome.item.asset.originalFile).toBe('original.png');
    expect(outcome.item.asset.previewFile).toBe('preview.webp');
    // The file name becomes a readable starting title before analysis lands.
    expect(outcome.item.profile.generated.title).toBe('Northstar Operations');

    const state = await readStateWithIndexes(paths);
    expect(state.items).toHaveLength(1);
    expect(state.items[0].previewPath).toBe(`items/${outcome.item.id}/preview.webp`);
  });

  it('opens the existing item when the same bytes are imported again', async () => {
    await upload('u1', 'first.png', 'identical-bytes');
    const first = await ingestUpload(paths, 'u1');

    await upload('u2', 'second-name.png', 'identical-bytes');
    const second = await ingestUpload(paths, 'u2');

    expect(second.status).toBe('duplicate');
    if (first.status !== 'created' || second.status !== 'duplicate') return;
    expect(second.item.id).toBe(first.item.id);
    expect(await readAllItems(paths)).toHaveLength(1);
  });

  it('treats different bytes as different items even with the same name', async () => {
    await upload('u1', 'shot.png', 'bytes-a');
    await upload('u2', 'shot.png', 'bytes-b');
    await ingestUpload(paths, 'u1');
    await ingestUpload(paths, 'u2');

    expect(await readAllItems(paths)).toHaveLength(2);
  });

  it('imports without a preview by falling back to the original', async () => {
    await beginUpload(paths, { ...manifestFor('u1', 'vector.svg'), chunkCounts: { original: 1, preview: 0 } });
    await writeUploadChunk(paths, 'u1', 'original', 0, Buffer.from('<svg/>').toString('base64'));
    await completeUpload(paths, 'u1');

    const outcome = await ingestUpload(paths, 'u1');
    expect(outcome.status).toBe('created');
    if (outcome.status !== 'created') return;
    expect(outcome.item.asset.previewFile).toBe(outcome.item.asset.originalFile);
  });

  it('clears the staging directory whether it created or deduplicated', async () => {
    await upload('u1', 'a.png', 'bytes');
    await ingestUpload(paths, 'u1');
    await upload('u2', 'b.png', 'bytes');
    await ingestUpload(paths, 'u2');

    expect(await readdir(paths.uploadsDir).catch(() => [])).toEqual([]);
  });

  it('refuses an upload that was never completed', async () => {
    await beginUpload(paths, manifestFor('u1', 'a.png'));
    await writeUploadChunk(paths, 'u1', 'original', 0, Buffer.from('bytes').toString('base64'));

    const outcome = await ingestUpload(paths, 'u1');
    expect(outcome.status).toBe('failed');
  });

  it('assembles chunks in index order regardless of arrival order', async () => {
    await beginUpload(paths, { ...manifestFor('u1', 'a.png'), chunkCounts: { original: 3, preview: 0 } });
    await writeUploadChunk(paths, 'u1', 'original', 2, Buffer.from('C').toString('base64'));
    await writeUploadChunk(paths, 'u1', 'original', 0, Buffer.from('A').toString('base64'));
    await writeUploadChunk(paths, 'u1', 'original', 1, Buffer.from('B').toString('base64'));
    await completeUpload(paths, 'u1');

    const outcome = await ingestUpload(paths, 'u1');
    expect(outcome.status).toBe('created');
    if (outcome.status !== 'created') return;
    expect(outcome.item.asset.bytes).toBe(3);

    // Same bytes in the same order means the same checksum as a single chunk.
    await upload('u2', 'b.png', 'ABC');
    expect((await ingestUpload(paths, 'u2')).status).toBe('duplicate');
  });
});

describe('pruneStaleUploads', () => {
  it('discards abandoned uploads but keeps completed ones', async () => {
    await beginUpload(paths, { ...manifestFor('stale', 'old.png'), createdAt: 0 });
    await upload('fresh', 'new.png', 'bytes');

    const removed = await pruneStaleUploads(paths, 60_000);
    expect(removed).toEqual(['stale']);
    expect((await readdir(paths.uploadsDir)).sort()).toEqual(['fresh']);
  });
});
