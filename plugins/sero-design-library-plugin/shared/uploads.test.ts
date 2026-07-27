import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { designLibraryPathsFromHome, uploadDir, type DesignLibraryPaths } from './paths';
import type { UploadManifest } from './uploads';
import {
  MAX_UPLOAD_BYTES,
  beginUpload,
  completeUpload,
  pruneStaleUploads,
  readUploadManifest,
  verifyUpload,
  writeUploadChunk,
} from './uploads';

/**
 * Staging is scratch, but scratch that nobody collects is a leak. Completion is
 * the gate: an upload that cannot be assembled must never be marked complete,
 * because pruning skips completed uploads and ingestion is the only other
 * collector.
 */

let home: string;
let paths: DesignLibraryPaths;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-uploads-'));
  paths = designLibraryPathsFromHome(home);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function manifest(id: string, chunkCounts: UploadManifest['chunkCounts']): UploadManifest {
  return {
    id,
    fileName: `${id}.png`,
    mediaType: 'image/png',
    kind: 'image',
    sourceKind: 'file',
    chunkCounts,
    previewMediaType: 'image/webp',
    createdAt: Date.now(),
    complete: false,
  };
}

async function chunk(id: string, index: number, content: string): Promise<void> {
  await writeUploadChunk(paths, id, 'original', index, Buffer.from(content).toString('base64'));
}

async function uploadExists(id: string): Promise<boolean> {
  return readdir(uploadDir(paths, id)).then(
    () => true,
    () => false,
  );
}

describe('completing an upload', () => {
  it('accepts one whose chunks all arrived', async () => {
    await beginUpload(paths, manifest('u-ok', { original: 2, preview: 0 }));
    await chunk('u-ok', 0, 'first');
    await chunk('u-ok', 1, 'second');

    await completeUpload(paths, 'u-ok');
    expect((await readUploadManifest(paths, 'u-ok'))?.complete).toBe(true);
  });

  it('refuses one that is missing a chunk, and discards it', async () => {
    await beginUpload(paths, manifest('u-short', { original: 3, preview: 0 }));
    await chunk('u-short', 0, 'first');
    await chunk('u-short', 1, 'second');

    await expect(completeUpload(paths, 'u-short')).rejects.toThrow(/promised 3 chunk\(s\) but 2 arrived/);
    // Nothing will ever ingest it, so it must not be left occupying disk.
    expect(await uploadExists('u-short')).toBe(false);
  });

  it('refuses one whose chunks have a gap in the middle', async () => {
    await beginUpload(paths, manifest('u-gap', { original: 2, preview: 0 }));
    await chunk('u-gap', 0, 'first');
    // Index 2 with index 1 absent would concatenate into a truncated file.
    await chunk('u-gap', 2, 'third');

    await expect(completeUpload(paths, 'u-gap')).rejects.toThrow(/not contiguous/);
    expect(await uploadExists('u-gap')).toBe(false);
  });

  it('refuses one that is over the size limit before anything is queued', async () => {
    const chunks = Math.ceil(MAX_UPLOAD_BYTES / (512 * 1024)) + 1;
    await beginUpload(paths, manifest('u-big', { original: chunks, preview: 0 }));
    const full = Buffer.alloc(512 * 1024, 1).toString('base64');
    await Promise.all(
      Array.from({ length: chunks }, (_unused, index) =>
        writeUploadChunk(paths, 'u-big', 'original', index, full),
      ),
    );

    await expect(completeUpload(paths, 'u-big')).rejects.toThrow(/over the .* byte limit/);
    expect(await uploadExists('u-big')).toBe(false);
  });

  it('reports every problem at once rather than the first', async () => {
    await beginUpload(paths, manifest('u-both', { original: 2, preview: 1 }));
    await chunk('u-both', 0, 'only');

    const problems = await verifyUpload(paths, manifest('u-both', { original: 2, preview: 1 }));
    expect(problems).toHaveLength(2);
    expect(problems.join(' ')).toContain('original');
    expect(problems.join(' ')).toContain('preview');
  });
});

describe('pruning staging', () => {
  it('removes an upload abandoned before completion', async () => {
    await beginUpload(paths, {
      ...manifest('u-old', { original: 1, preview: 0 }),
      createdAt: Date.now() - 10_000,
    });

    expect(await pruneStaleUploads(paths, 5_000)).toEqual(['u-old']);
    expect(await uploadExists('u-old')).toBe(false);
  });

  it('removes a completed upload nothing ever ingested', async () => {
    await beginUpload(paths, {
      ...manifest('u-orphan', { original: 1, preview: 0 }),
      createdAt: Date.now() - 10_000,
    });
    await chunk('u-orphan', 0, 'bytes');
    await completeUpload(paths, 'u-orphan');

    // Completed-but-unconsumed is exactly what a crash between the two leaves.
    expect(await pruneStaleUploads(paths, 5_000)).toEqual(['u-orphan']);
    expect(await uploadExists('u-orphan')).toBe(false);
  });

  it('leaves an upload that is still within the window', async () => {
    await beginUpload(paths, manifest('u-fresh', { original: 1, preview: 0 }));

    expect(await pruneStaleUploads(paths, 5_000)).toEqual([]);
    expect(await uploadExists('u-fresh')).toBe(true);
  });

  it('spares an upload a queued import is still waiting on', async () => {
    // Pruning runs at startup, before requests are drained. Closing the app
    // between completing an upload and importing it must not lose the file,
    // however long ago the upload started.
    await beginUpload(paths, {
      ...manifest('u-queued', { original: 1, preview: 0 }),
      createdAt: Date.now() - 10_000,
    });
    await chunk('u-queued', 0, 'bytes');
    await completeUpload(paths, 'u-queued');

    expect(await pruneStaleUploads(paths, 5_000, Date.now(), new Set(['u-queued']))).toEqual([]);
    expect(await uploadExists('u-queued')).toBe(true);
  });

  it('still collects an old upload nothing is waiting on', async () => {
    await beginUpload(paths, {
      ...manifest('u-unclaimed', { original: 1, preview: 0 }),
      createdAt: Date.now() - 10_000,
    });

    expect(await pruneStaleUploads(paths, 5_000, Date.now(), new Set(['other-id']))).toEqual([
      'u-unclaimed',
    ]);
  });
});
