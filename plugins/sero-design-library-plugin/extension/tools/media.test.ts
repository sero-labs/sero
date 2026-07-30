import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';

import { deleteAsset, recordAttempt, reserveAsset } from '../../runtime/media/assets';
import { seedDesign, seedItem } from '../../runtime/test-fixtures';
import { assetReferenceFor } from '../../shared/media';
import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../../shared/paths';
import { readState } from '../../shared/state-io';
import { registerMediaTool } from './media';

/**
 * The media tool is where money starts being spent, so what it refuses matters
 * as much as what it queues. Two properties carry most of the risk and are
 * asserted directly: a refusal queues *nothing*, and every generation carries an
 * id the caller allocated — which is what makes an at-least-once request log
 * safe to replay.
 */

let home: string;
let paths: DesignLibraryPaths;
let tools: Map<string, ToolDefinition>;

function collectTools(): ExtensionAPI {
  tools = new Map();
  return {
    registerTool(definition: ToolDefinition) {
      tools.set(definition.name, definition);
    },
  } as unknown as ExtensionAPI;
}

async function call(params: Record<string, unknown>) {
  const tool = tools.get('design_library_media');
  if (!tool) throw new Error('design_library_media was never registered');
  return tool.execute('test-call', params, new AbortController().signal, () => undefined, undefined as never);
}

function textOf(result: { content: Array<{ type: string }> }): string {
  const block = result.content.find((entry) => entry.type === 'text');
  return block && 'text' in block ? String(block.text) : '';
}

async function requests() {
  return (await readState(paths)).requests.map((request) => request.body);
}

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-media-tool-'));
  paths = designLibraryPathsFromHome(path.join(home, 'apps', 'design-library'));
  registerMediaTool(collectTools(), paths);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

const GENERATE = { action: 'generate', designId: 'design-1', capability: 'text-to-image' };

describe('refusing a generation', () => {
  it('rejects a traversal in a design or asset id without queuing anything', async () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['generate', { ...GENERATE, designId: '../../..', prompt: 'a texture' }],
      ['retry', { action: 'retry', designId: 'design-1', assetId: '../../..' }],
      ['purge', { action: 'purge', designId: '../../..', assetId: 'asset-1' }],
      ['copy-to-library', { action: 'copy-to-library', designId: 'design-1', assetId: '../../..' }],
    ];
    for (const [label, params] of cases) {
      const result = await call(params);
      expect(textOf(result), label).toMatch(/not a valid (design|asset) id/);
    }
    expect(await requests()).toEqual([]);
  });

  it('rejects a source id that is not a safe identifier', async () => {
    const result = await call({
      ...GENERATE,
      capability: 'image-to-image',
      prompt: 'warmer',
      sourceId: '../../..',
    });

    expect(textOf(result)).toContain('not a valid source id');
    expect(await requests()).toEqual([]);
  });

  it('needs a prompt for everything except upscale', async () => {
    const result = await call({ ...GENERATE, prompt: '   ' });

    expect(textOf(result)).toContain('needs a prompt');
    expect(await requests()).toEqual([]);
  });

  it('needs a source for reference images, restyles and upscale, naming the parameter', async () => {
    for (const capability of ['reference-to-image', 'image-to-image', 'upscale']) {
      const result = await call({ ...GENERATE, capability, prompt: 'sharper' });
      expect(textOf(result), capability).toContain('`sourceId`');
    }
    // `generate-into-library` takes its source under a different name, and says so.
    const library = await call({
      action: 'generate-into-library',
      capability: 'upscale',
      prompt: 'sharper',
    });
    expect(textOf(library)).toContain('`sourceItemId`');
    expect(await requests()).toEqual([]);
  });

  it('lets upscale through without a prompt, since it works from the source', async () => {
    await call({ ...GENERATE, capability: 'upscale', sourceId: 'item-1' });

    expect(await requests()).toMatchObject([
      { kind: 'media.generate', request: { capability: 'upscale' } },
    ]);
  });
});

describe('queuing a generation', () => {
  it('allocates the asset id itself and returns the reference the page must use', async () => {
    const result = await call({ ...GENERATE, prompt: 'an abstract gradient', aspectRatio: '16:9' });

    const details = (result as { details: { assetId: string; reference: string } }).details;
    const [queued] = await requests();
    // The id in the request is the one handed back, so applying this request
    // twice finds the asset already reserved rather than paying twice.
    expect(queued).toMatchObject({
      kind: 'media.generate',
      designId: 'design-1',
      assetId: details.assetId,
      request: { capability: 'text-to-image', prompt: 'an abstract gradient', aspectRatio: '16:9' },
    });
    // And it matches what reservation will independently derive, so the `src`
    // the model writes now resolves against the file that lands later.
    expect(details.reference).toBe(assetReferenceFor(details.assetId, 'text-to-image'));
    expect(textOf(result)).toContain(details.reference);
  });

  it('keeps a video request’s duration, so the run asks for what was requested', async () => {
    await call({
      ...GENERATE,
      capability: 'text-to-video',
      prompt: 'a slow pan over a city',
      durationSeconds: 4,
    });

    expect(await requests()).toMatchObject([
      { kind: 'media.generate', request: { capability: 'text-to-video', durationSeconds: 4 } },
    ]);
  });

  it('gives each Library generation its own slot id', async () => {
    const first = await call({ action: 'generate-into-library', prompt: 'a paper texture' });
    const second = await call({ action: 'generate-into-library', prompt: 'a paper texture' });

    const slots = (await requests()).map((body) => (body as { slotId: string }).slotId);
    expect(slots[0]).not.toBe(slots[1]);
    expect((first as { details: { slotId: string } }).details.slotId).toBe(slots[0]);
    expect((second as { details: { slotId: string } }).details.slotId).toBe(slots[1]);
  });

  it('defaults a Library generation to text-to-image and carries the source when given', async () => {
    await call({
      action: 'generate-into-library',
      capability: 'image-to-image',
      prompt: 'the same poster, colder',
      sourceItemId: 'item-1',
    });

    expect(await requests()).toMatchObject([
      { kind: 'library.generate', capability: 'image-to-image', sourceItemId: 'item-1' },
    ]);
  });
});

describe('managing what came back', () => {
  it('maps each lifecycle action onto one request', async () => {
    const target = { designId: 'design-1', assetId: 'asset-1' };
    await call({ action: 'retry', ...target });
    await call({ action: 'delete', ...target });
    await call({ action: 'restore', ...target });
    await call({ action: 'purge', ...target });
    await call({ action: 'copy-to-library', ...target });

    expect(await requests()).toMatchObject([
      { kind: 'media.retry', ...target },
      { kind: 'media.delete', ...target, deleted: true },
      { kind: 'media.delete', ...target, deleted: false },
      { kind: 'media.purge', ...target },
      { kind: 'media.copy-to-library', ...target },
    ]);
  });
});

describe('listing a tray', () => {
  it('tells a running asset from one a dead run abandoned', async () => {
    await seedDesign(paths, 'design-1');
    await reserveAsset(paths, 'design-1', { capability: 'text-to-image', prompt: 'running' }, {
      jobId: 'job-1',
    });
    await reserveAsset(paths, 'design-1', { capability: 'text-to-image', prompt: 'abandoned' });

    const listed = textOf(await call({ action: 'list', designId: 'design-1' }));

    expect(listed).toContain('generating');
    // The distinction the tray turns into a retry button rather than a spinner
    // nobody owns.
    expect(listed).toContain('interrupted — retryable');
  });

  it('reports cost across every attempt, including one that failed after billing', async () => {
    await seedDesign(paths, 'design-1');
    const asset = await reserveAsset(paths, 'design-1', {
      capability: 'text-to-image',
      prompt: 'a gradient',
    });
    if (!asset) throw new Error('the asset was not reserved');

    const provenance = {
      providerId: 'fal',
      capability: 'text-to-image' as const,
      model: 'test-model',
      prompt: 'a gradient',
      parameters: {},
      startedAt: 0,
      completedAt: 1,
    };
    await recordAttempt(paths, 'design-1', asset.id, {
      id: 'attempt-1',
      outcome: 'failed',
      startedAt: 0,
      completedAt: 1,
      provenance: { ...provenance, costUsd: 0.01 },
      error: { code: 'provider', message: 'The provider failed.', retryable: true },
    });
    await recordAttempt(paths, 'design-1', asset.id, {
      id: 'attempt-2',
      outcome: 'ready',
      startedAt: 2,
      completedAt: 3,
      file: `${asset.id}.png`,
      mediaType: 'image/png',
      provenance: { ...provenance, costUsd: 0.02 },
    });

    const result = await call({ action: 'list', designId: 'design-1' });

    expect((result as { details: { designCostUsd: number } }).details.designCostUsd).toBeCloseTo(0.03);
    const listed = textOf(result);
    // The visible state is the newest attempt; the failure it replaced is still
    // on the record and still paid for.
    expect(listed).toContain('ready');
    expect(listed).toContain('2 attempts');
    expect(listed).toContain('$0.030');
  });

  it('hides a deleted asset unless it is asked for', async () => {
    await seedDesign(paths, 'design-1');
    await seedItem(paths, 'unrelated');
    const asset = await reserveAsset(paths, 'design-1', {
      capability: 'text-to-image',
      prompt: 'a gradient',
    });
    if (!asset) throw new Error('the asset was not reserved');
    // The tool only queues a deletion; applying it is the runtime's job, so the
    // record is marked here directly to set up the read this test is about.
    await deleteAsset(paths, 'design-1', asset.id, true);

    expect(textOf(await call({ action: 'list', designId: 'design-1' }))).toContain('No assets');
    expect(
      textOf(await call({ action: 'list', designId: 'design-1', includeDeleted: true })),
    ).toContain('deleted');
  });

  it('says so when the Design is not there', async () => {
    expect(textOf(await call({ action: 'list', designId: 'missing' }))).toContain('No Design missing');
  });
});
