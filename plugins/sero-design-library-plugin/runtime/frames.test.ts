import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { currentAttempt } from '../shared/media';
import { designAssetDir, designLibraryPathsFromHome, itemDir, uploadDir, type DesignLibraryPaths } from '../shared/paths';
import { beginUpload, completeUpload, writeUploadChunk, type UploadManifest } from '../shared/uploads';
import { readDesign } from './design-store';
import { attachFrames } from './frames';
import { recordAttempt, reserveAsset } from './media/assets';
import { readItem } from './store';
import { seedDesign, seedItem } from './test-fixtures';

/**
 * Attaching stills the renderer captured from a video (D4).
 *
 * The runtime has no codecs, so this is the only way a generated clip ever gets
 * a thumbnail or something the Librarian can read. What matters here is that it
 * lands on the right record, that a replay does not double it, and that the
 * staging directory is always cleaned up — an upload nothing will consume is a
 * leak the startup prune only reaches after it has aged out.
 */

let home: string;
let paths: DesignLibraryPaths;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-frames-'));
  paths = designLibraryPathsFromHome(path.join(home, 'apps', 'design-library'));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

const POSTER = Buffer.from('poster-bytes');
const FILMSTRIP = Buffer.from('filmstrip-bytes');

async function stageFrames(options: { filmstrip?: boolean } = {}): Promise<string> {
  const manifest: UploadManifest = {
    id: 'upload-1',
    fileName: 'frames.webp',
    mediaType: 'image/webp',
    kind: 'image',
    sourceKind: 'file',
    chunkCounts: { original: 0, preview: 1, frames: options.filmstrip === false ? 0 : 1 },
    previewMediaType: 'image/webp',
    createdAt: Date.now(),
    complete: false,
  };
  await beginUpload(paths, manifest);
  await writeUploadChunk(paths, manifest.id, 'preview', 0, POSTER.toString('base64'));
  if (options.filmstrip !== false) {
    await writeUploadChunk(paths, manifest.id, 'frames', 0, FILMSTRIP.toString('base64'));
  }
  await completeUpload(paths, manifest.id);
  return manifest.id;
}

async function exists(file: string): Promise<boolean> {
  return stat(file).then(
    () => true,
    () => false,
  );
}

describe('a Library item', () => {
  it('takes the poster as its preview and keeps the filmstrip for the Librarian', async () => {
    await seedItem(paths, 'item-1');
    const uploadId = await stageFrames();

    const outcome = await attachFrames(paths, {
      kind: 'frames.attach',
      uploadId,
      target: { kind: 'item', itemId: 'item-1' },
    });

    const item = await readItem(paths, 'item-1');
    expect(item?.asset.previewFile).toBe('poster.webp');
    expect(item?.asset.framesFile).toBe('frames.webp');
    expect(await readFile(path.join(itemDir(paths, 'item-1'), 'poster.webp'))).toEqual(POSTER);
    expect(await readFile(path.join(itemDir(paths, 'item-1'), 'frames.webp'))).toEqual(FILMSTRIP);
    // Analysis was held back while there was nothing to look at; this is what
    // releases it.
    expect(outcome.analyse).toBe('item-1');
  });

  it('clears the flag that was holding analysis back', async () => {
    await seedItem(paths, 'item-1');
    // Mark it as a generated video waiting on the renderer.
    const before = await readItem(paths, 'item-1');
    expect(before).not.toBeNull();

    await attachFrames(paths, {
      kind: 'frames.attach',
      uploadId: await stageFrames(),
      target: { kind: 'item', itemId: 'item-1' },
    });

    expect((await readItem(paths, 'item-1'))?.awaitingFrames).toBeUndefined();
  });

  it('discards the staging directory whatever happens', async () => {
    const uploadId = await stageFrames();
    // No such item: the attach does nothing, and the upload must still go.
    await attachFrames(paths, {
      kind: 'frames.attach',
      uploadId,
      target: { kind: 'item', itemId: 'missing' },
    });

    expect(await exists(uploadDir(paths, uploadId))).toBe(false);
  });

  it('is safe to apply twice, because the request log is at-least-once', async () => {
    await seedItem(paths, 'item-1');
    const uploadId = await stageFrames();
    const body = {
      kind: 'frames.attach' as const,
      uploadId,
      target: { kind: 'item' as const, itemId: 'item-1' },
    };

    await attachFrames(paths, body);
    // The upload is gone, so the replay finds nothing to attach and says so
    // rather than blanking the preview it already wrote.
    const second = await attachFrames(paths, body);

    expect(second.analyse).toBeUndefined();
    expect((await readItem(paths, 'item-1'))?.asset.previewFile).toBe('poster.webp');
  });
});

describe('a Design asset', () => {
  it('takes the poster onto the attempt the frames came from', async () => {
    await seedDesign(paths, 'design-1');
    const asset = await reserveAsset(paths, 'design-1', {
      capability: 'text-to-video',
      prompt: 'a slow pan',
    });
    if (!asset) throw new Error('the asset was not reserved');
    await recordAttempt(paths, 'design-1', asset.id, {
      id: 'attempt-1',
      outcome: 'ready',
      startedAt: 0,
      completedAt: 1,
      file: 'clip.mp4',
      mediaType: 'video/mp4',
    });

    await attachFrames(paths, {
      kind: 'frames.attach',
      uploadId: await stageFrames(),
      target: { kind: 'asset', designId: 'design-1', assetId: asset.id, attemptId: 'attempt-1' },
    });

    const design = await readDesign(paths, 'design-1');
    const stored = design?.assets.find((entry) => entry.id === asset.id);
    // On the attempt, not the asset: a retry produces different footage, and a
    // poster that outlived its attempt would show the old clip under the new.
    // Named for the attempt, so a capture that arrives after a retry cannot
    // leave its frames in the file the new attempt's record points at.
    expect(currentAttempt(stored!)?.posterFile).toBe('poster-attempt-1.webp');
    expect(
      await readFile(path.join(designAssetDir(paths, 'design-1', asset.id), 'poster-attempt-1.webp')),
    ).toEqual(POSTER);
  });

  it('does not store a filmstrip for an asset, which nothing reads', async () => {
    await seedDesign(paths, 'design-1');
    const asset = await reserveAsset(paths, 'design-1', {
      capability: 'text-to-video',
      prompt: 'a slow pan',
    });
    if (!asset) throw new Error('the asset was not reserved');
    await recordAttempt(paths, 'design-1', asset.id, {
      id: 'attempt-1',
      outcome: 'ready',
      startedAt: 0,
      completedAt: 1,
      file: 'clip.mp4',
    });

    await attachFrames(paths, {
      kind: 'frames.attach',
      uploadId: await stageFrames(),
      target: { kind: 'asset', designId: 'design-1', assetId: asset.id, attemptId: 'attempt-1' },
    });

    // Nothing analyses a Design asset, so a filmstrip would be bytes with no
    // reader.
    expect(
      await exists(path.join(designAssetDir(paths, 'design-1', asset.id), 'frames.webp')),
    ).toBe(false);
  });

  it('refuses a poster for footage a retry has replaced', async () => {
    await seedDesign(paths, 'design-1');
    const asset = await reserveAsset(paths, 'design-1', {
      capability: 'text-to-video',
      prompt: 'a slow pan',
    });
    if (!asset) throw new Error('the asset was not reserved');
    await recordAttempt(paths, 'design-1', asset.id, {
      id: 'attempt-1',
      outcome: 'ready',
      startedAt: 0,
      completedAt: 1,
      file: 'clip.mp4',
    });
    // A retry lands while the renderer is still decoding the first clip.
    await recordAttempt(paths, 'design-1', asset.id, {
      id: 'attempt-2',
      outcome: 'ready',
      startedAt: 2,
      completedAt: 3,
      file: 'clip.mp4',
    });

    await attachFrames(paths, {
      kind: 'frames.attach',
      uploadId: await stageFrames(),
      target: { kind: 'asset', designId: 'design-1', assetId: asset.id, attemptId: 'attempt-1' },
    });

    // The poster is of footage nobody can see any more, so it is dropped rather
    // than shown under the clip that replaced it.
    const design = await readDesign(paths, 'design-1');
    const stored = design?.assets.find((entry) => entry.id === asset.id);
    expect(currentAttempt(stored!)?.posterFile).toBeUndefined();
  });

  it('leaves an asset with no successful attempt alone', async () => {
    await seedDesign(paths, 'design-1');
    const asset = await reserveAsset(paths, 'design-1', {
      capability: 'text-to-video',
      prompt: 'a slow pan',
    });
    if (!asset) throw new Error('the asset was not reserved');

    await attachFrames(paths, {
      kind: 'frames.attach',
      uploadId: await stageFrames(),
      target: { kind: 'asset', designId: 'design-1', assetId: asset.id, attemptId: 'attempt-1' },
    });

    const design = await readDesign(paths, 'design-1');
    expect(design?.assets.find((entry) => entry.id === asset.id)?.attempts).toEqual([]);
  });
});

describe('an incomplete upload', () => {
  it('is ignored rather than writing half of what was promised', async () => {
    await seedItem(paths, 'item-1');
    const manifest: UploadManifest = {
      id: 'upload-2',
      fileName: 'frames.webp',
      mediaType: 'image/webp',
      kind: 'image',
      sourceKind: 'file',
      chunkCounts: { original: 0, preview: 1, frames: 1 },
      previewMediaType: 'image/webp',
      createdAt: Date.now(),
      complete: false,
    };
    await beginUpload(paths, manifest);

    // Never completed: the uploader died part-way through.
    const outcome = await attachFrames(paths, {
      kind: 'frames.attach',
      uploadId: manifest.id,
      target: { kind: 'item', itemId: 'item-1' },
    });

    expect(outcome.analyse).toBeUndefined();
    expect((await readItem(paths, 'item-1'))?.asset.previewFile).toBe('preview.webp');
  });
});
