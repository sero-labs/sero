/**
 * The reference path spends money, so the tests that matter are about not
 * spending it twice and not carrying on without what was bought. A stub
 * provider stands in for fal and counts every call it is asked to make.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { MediaProvider, MediaRequest } from '../../../runtime/media/contract';
import type { MediaCapability } from '../../../shared/media';
import { MediaError } from '../../../runtime/media/contract';
import { encodeIndexedPng } from '../png';
import { prepareReference } from './reference';

let workDir = '';

/** A knight-shaped blob on a checkerboard, as an indexed PNG — the same shape
 * of picture a model returns. */
function pictureOfSomething(width = 60, height = 100): Buffer {
  const cells = new Int16Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = x >= 20 && x < 40 && y >= 8 && y < 92;
      cells[y * width + x] = inside ? 2 : (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0 ? 0 : 1;
    }
  }
  return encodeIndexedPng(cells, width, height, [
    [245, 245, 245],
    [220, 220, 220],
    [90, 110, 140],
  ]);
}

function stubProvider(options: { fail?: boolean } = {}): MediaProvider & { calls: MediaRequest[] } {
  const calls: MediaRequest[] = [];
  return {
    id: 'stub',
    displayName: 'Stub',
    calls,
    capabilities: (): MediaCapability[] => ['text-to-image', 'image-to-image'],
    defaultModel: () => 'stub/model',
    async generate(request, context) {
      calls.push(request);
      if (options.fail === true) {
        throw new MediaError('provider', 'the endpoint refused', false);
      }
      // Reading the source asset is how a real adapter uploads it; doing it
      // here proves the bytes we hand over are readable.
      for (const id of request.sourceAssetIds ?? []) await context.readAsset(id);
      const stored = await context.store('out.png', pictureOfSomething());
      return {
        files: [{ path: stored, mediaType: 'image/png' }],
        provenance: {
          providerId: 'stub',
          capability: request.capability,
          model: request.model ?? 'stub/model',
          prompt: request.prompt,
          parameters: {},
          startedAt: 0,
          completedAt: 0,
        },
      };
    },
  };
}

const canvas = { canvasW: 112, canvasH: 144, groundRow: 138 };

beforeEach(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'puppet-ref-'));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('prepareReference', () => {
  it('buys one side view from a supplied picture and stands it on the canvas', async () => {
    const source = path.join(workDir, 'knight.jpg');
    await writeFile(source, pictureOfSomething());
    const provider = stubProvider();
    const prepared = await prepareReference(
      { file: source },
      { provider, directory: path.join(workDir, 'reference'), ...canvas, signal: new AbortController().signal },
    );

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].capability).toBe('image-to-image');
    expect(prepared.purchased).toBe(true);
    // Placed at the fill the author is held to, and standing on the ground row.
    expect(prepared.figureH).toBe(Math.round(144 * 0.85));
    expect(prepared.figureW).toBeGreaterThan(0);
    expect(prepared.materials.length).toBeGreaterThan(0);
    for (const file of [prepared.sidePath, prepared.targetPath, prepared.viewPath]) {
      expect((await readFile(file)).byteLength).toBeGreaterThan(0);
    }
  });

  it('never buys the same side view twice', async () => {
    // Request logs replay, runs resume, and a crash leaves a directory behind.
    // Any of those buying the picture again is money spent for a file that is
    // already on disk.
    const source = path.join(workDir, 'knight.jpg');
    await writeFile(source, pictureOfSomething());
    const provider = stubProvider();
    const context = {
      provider,
      directory: path.join(workDir, 'reference'),
      ...canvas,
      signal: new AbortController().signal,
    };
    const first = await prepareReference({ file: source }, context);
    const second = await prepareReference({ file: source }, context);
    expect(provider.calls).toHaveLength(1);
    expect(first.purchased).toBe(true);
    expect(second.purchased).toBe(false);
    expect(second.figureH).toBe(first.figureH);
  });

  it('draws the reference from words when there is no picture, once', async () => {
    const provider = stubProvider();
    const context = {
      provider,
      directory: path.join(workDir, 'reference'),
      ...canvas,
      signal: new AbortController().signal,
    };
    await prepareReference({ prompt: 'a knight in plate armour' }, context);
    expect(provider.calls.map((c) => c.capability)).toEqual(['text-to-image', 'image-to-image']);
    await prepareReference({ prompt: 'a knight in plate armour' }, context);
    expect(provider.calls).toHaveLength(2); // nothing bought the second time
  });

  it('fails rather than authoring without the target it was asked to aim at', async () => {
    const source = path.join(workDir, 'knight.jpg');
    await writeFile(source, pictureOfSomething());
    const provider = stubProvider({ fail: true });
    await expect(
      prepareReference(
        { file: source },
        { provider, directory: path.join(workDir, 'reference'), ...canvas, signal: new AbortController().signal },
      ),
    ).rejects.toThrow(/side view could not be drawn/);
  });

  it('refuses a request with neither a picture nor words', async () => {
    const provider = stubProvider();
    await expect(
      prepareReference(
        {},
        { provider, directory: path.join(workDir, 'reference'), ...canvas, signal: new AbortController().signal },
      ),
    ).rejects.toThrow(/picture or words/);
    expect(provider.calls).toHaveLength(0);
  });

  it('fails when the backdrop swallowed the figure instead of writing an empty target', async () => {
    // A side view that is all one colour: nothing to separate. Reported, never
    // written out as an empty canvas the author would then aim at.
    const source = path.join(workDir, 'knight.jpg');
    await writeFile(source, pictureOfSomething());
    const provider = stubProvider();
    const dir = path.join(workDir, 'blank');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, 'side.png'),
      encodeIndexedPng(new Int16Array(40 * 40), 40, 40, [[10, 10, 10]]),
    );
    await expect(
      prepareReference(
        { file: source },
        { provider, directory: dir, ...canvas, signal: new AbortController().signal },
      ),
    ).rejects.toThrow(/background swallowed it/);
    expect(provider.calls).toHaveLength(0); // and nothing was bought to find out
  });
});
