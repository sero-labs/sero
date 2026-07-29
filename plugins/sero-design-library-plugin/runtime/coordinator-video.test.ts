import { describe, expect, it, vi } from 'vitest';

import { appendRequest, readState } from '../shared/state-io';
import { beginUpload, completeUpload, writeUploadChunk } from '../shared/uploads';
import { useCoordinator } from './coordinator-harness';
import { readItem } from './store';

/**
 * Generated video, end to end (D4).
 *
 * Its own file because it needs a harness that approves the video confirmation,
 * and approving by default would make every other media test spend on a
 * capability it never asked for.
 */

const harness = useCoordinator('video', { approveVideo: true });

describe('a generated video', () => {
  /**
   * The renderer decodes video, not the runtime — so a clip arrives with
   * nothing to thumbnail and nothing the Librarian can look at. Analysing it
   * anyway would burn a model call to produce a confident profile of an mp4 the
   * model never decoded, which is the failure the whole frames path exists to
   * prevent.
   */
  it('waits for frames instead of analysing an mp4 nobody can see', async () => {
    await appendRequest(harness.paths, {
      kind: 'library.generate',
      slotId: 'slot-video',
      capability: 'text-to-video',
      prompt: 'a slow pan across a city',
    });
    await harness.coordinator.drain();

    const itemId = await vi.waitFor(async () => {
      const state = await readState(harness.paths);
      const generated = state.items.find((item) => item.kind === 'video');
      expect(generated).toBeDefined();
      return generated!.id;
    });

    const item = await readItem(harness.paths, itemId);
    expect(item?.awaitingFrames).toBe(true);
    // Held, not failed: it resolves by itself the next time the app is open.
    expect(item?.analysis.status).toBe('pending');
    expect(item?.analysis.jobId).toBeUndefined();
  });

  it('analyses once the renderer has sent frames', async () => {
    await appendRequest(harness.paths, {
      kind: 'library.generate',
      slotId: 'slot-video',
      capability: 'text-to-video',
      prompt: 'a slow pan across a city',
    });
    await harness.coordinator.drain();

    const itemId = await vi.waitFor(async () => {
      const state = await readState(harness.paths);
      const generated = state.items.find((item) => item.kind === 'video');
      expect(generated).toBeDefined();
      return generated!.id;
    });

    const uploadId = 'frames-upload';
    await beginUpload(harness.paths, {
      id: uploadId,
      fileName: 'frames.webp',
      mediaType: 'image/webp',
      kind: 'image',
      sourceKind: 'file',
      chunkCounts: { original: 0, preview: 1, frames: 1 },
      previewMediaType: 'image/webp',
      createdAt: Date.now(),
      complete: false,
    });
    await writeUploadChunk(harness.paths, uploadId, 'preview', 0, Buffer.from('p').toString('base64'));
    await writeUploadChunk(harness.paths, uploadId, 'frames', 0, Buffer.from('f').toString('base64'));
    await completeUpload(harness.paths, uploadId);

    await appendRequest(harness.paths, {
      kind: 'frames.attach',
      uploadId,
      target: { kind: 'item', itemId },
    });
    await harness.coordinator.drain();

    await vi.waitFor(async () => {
      expect((await readItem(harness.paths, itemId))?.analysis.status).toBe('ready');
    });
    // And the Librarian was shown the filmstrip, not the mp4.
    expect((await readItem(harness.paths, itemId))?.asset.framesFile).toBe('frames.webp');
  });
});

/**
 * A video model whose shortest clip costs more than one press is allowed to.
 *
 * Its own harness because the refusal has to happen with the confirmation
 * standing by to approve — otherwise a test could pass because the video was
 * declined for an entirely different reason.
 */
describe('a video model that only makes long clips', () => {
  const longOnly = useCoordinator('video-long', {
    approveVideo: true,
    provider: { modelOptions: { 'text-to-video': { durationsSeconds: [20, 40] } } },
  });

  it('is refused rather than bought at its own length', async () => {
    await appendRequest(longOnly.paths, {
      kind: 'library.generate',
      slotId: 'slot-long',
      capability: 'text-to-video',
      prompt: 'a slow pan across a city',
    });
    await longOnly.coordinator.drain();

    await vi.waitFor(async () => {
      const state = await readState(longOnly.paths);
      const job = state.jobs.find((entry) => entry.status === 'failed');
      expect(job?.error).toContain('shorter');
    });

    // Nothing was made and nothing was charged for.
    const state = await readState(longOnly.paths);
    expect(state.items).toHaveLength(0);
  });
});
