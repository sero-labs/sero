import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppRuntimeHost, AppRuntimeSubagentRunParams } from '@sero-ai/common';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

import { designLibraryPathsFromHome, tombstoneFile, type DesignLibraryPaths } from '../shared/paths';
import { appendRequest, readState } from '../shared/state-io';
import { beginUpload, completeUpload, writeUploadChunk } from '../shared/uploads';
import { Coordinator } from './coordinator';
import { invokeTool } from './librarian/test-support';
import { readItem } from './store';

/**
 * The coordinator drives real records against a stubbed model, so these cover
 * the paths that matter without a network call.
 */

let home: string;
let paths: DesignLibraryPaths;
let coordinator: Coordinator;
let runStructured: ReturnType<typeof vi.fn>;

const ANALYSIS_REPLY = JSON.stringify({
  title: 'Analysed title',
  primaryStyle: 'Technical monochrome',
  designTypes: ['dashboard'],
  tags: ['a', 'b', 'c', 'd', 'e', 'f'],
  summary: 'A summary.',
  designIntent: 'An intent.',
  aestheticVocabulary: [{ term: 'exact' }],
  visualProfile: { colour: ['near-black'] },
  palette: [{ hex: '#0b0b0d', role: 'background' }],
  always: ['Keep geometry square'],
  never: ['Decorative gradients'],
  generationPrompt: Array.from({ length: 100 }, () => 'word').join(' '),
  confidence: 0.9,
});

/**
 * A stub that behaves like a model that does its job: it calls the reference
 * tool before answering. Skipping that call is what the run now refuses, so
 * the stub has to do it for the analysis to be accepted.
 */
function stubHost(): AppRuntimeHost {
  runStructured = vi.fn(async (params: AppRuntimeSubagentRunParams) => {
    const tools = (params.customTools ?? []) as ToolDefinition[];
    const viewer = tools.find((tool) => tool.name === 'design_library_view_reference');
    if (viewer) {
      await invokeTool(viewer);
    }
    return { response: ANALYSIS_REPLY, modelId: 'stub-model', providerId: 'stub' };
  });
  return { subagents: { runStructured } } as unknown as AppRuntimeHost;
}

async function upload(id: string, fileName: string, content: string): Promise<void> {
  await beginUpload(paths, {
    id,
    fileName,
    mediaType: 'image/png',
    kind: 'image',
    sourceKind: 'file',
    chunkCounts: { original: 1, preview: 0 },
    previewMediaType: 'image/webp',
    createdAt: Date.now(),
    complete: false,
  });
  await writeUploadChunk(paths, id, 'original', 0, Buffer.from(content).toString('base64'));
  await completeUpload(paths, id);
}

/** Import one reference and let its automatic analysis finish. */
async function importAndAnalyse(uploadId: string, fileName: string, content: string): Promise<string> {
  await upload(uploadId, fileName, content);
  await appendRequest(paths, { kind: 'ingest', uploadId });
  await coordinator.drain();
  const state = await readState(paths);
  const itemId = state.items[state.items.length - 1].id;
  await vi.waitFor(async () => {
    expect((await readItem(paths, itemId))?.analysis.status).toBe('ready');
  });
  return itemId;
}

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-coordinator-'));
  paths = designLibraryPathsFromHome(home);
  coordinator = new Coordinator({
    host: stubHost(),
    paths,
    workspaceId: 'ws',
    sessionId: 'session',
    onError: () => undefined,
  });
});

afterEach(async () => {
  await coordinator.dispose();
  await rm(home, { recursive: true, force: true });
});

describe('applying requests', () => {
  it('imports and analyses automatically', async () => {
    const itemId = await importAndAnalyse('u1', 'shot.png', 'bytes');

    const item = await readItem(paths, itemId);
    expect(item?.profile.generated.primaryStyle).toBe('Technical monochrome');
    expect(item?.profile.generated.provenance.modelId).toBe('stub-model');

    // Analysis gets no platform tools at all — only the reference viewer.
    expect(runStructured.mock.calls[0][0].platformTools).toBe('none');
  });

  it('does not navigate into a newly imported reference', async () => {
    // Opening is a full-surface navigation, so a bulk import must leave the
    // user in the grid rather than jumping to the last file.
    await importAndAnalyse('u1', 'a.png', 'first');
    await importAndAnalyse('u2', 'b.png', 'second');

    expect((await readState(paths)).view.selectedItemId).toBeUndefined();
  });

  it('opens the existing item when a duplicate is imported', async () => {
    const first = await importAndAnalyse('u1', 'a.png', 'identical');

    await upload('u2', 'b.png', 'identical');
    await appendRequest(paths, { kind: 'ingest', uploadId: 'u2' });
    await coordinator.drain();

    const state = await readState(paths);
    expect(state.items).toHaveLength(1);
    expect(state.view.selectedItemId).toBe(first);
  });

  it('keeps a manual field through reanalysis and restores it on reset', async () => {
    const itemId = await importAndAnalyse('u1', 'shot.png', 'bytes');

    await appendRequest(paths, {
      kind: 'item.set-field',
      itemId,
      field: 'primaryStyle',
      value: 'My own style',
    });
    await coordinator.drain();

    await appendRequest(paths, { kind: 'analysis.run', itemId, force: true });
    await coordinator.drain();
    await vi.waitFor(async () => {
      expect((await readItem(paths, itemId))?.analysis.attempts).toBe(2);
    });

    const summary = (await readState(paths)).items.find((entry) => entry.id === itemId);
    expect(summary?.primaryStyle).toBe('My own style');
    expect(summary?.edited).toBe(true);

    await appendRequest(paths, { kind: 'item.reset-field', itemId, field: 'primaryStyle' });
    await coordinator.drain();

    const afterReset = (await readState(paths)).items.find((entry) => entry.id === itemId);
    expect(afterReset?.primaryStyle).toBe('Technical monochrome');
    expect(afterReset?.edited).toBe(false);
  });

  it('advances the watermark and drops applied requests', async () => {
    const itemId = await importAndAnalyse('u1', 'shot.png', 'bytes');
    await appendRequest(paths, { kind: 'item.favourite', itemId, favourite: true });
    await coordinator.drain();

    const state = await readState(paths);
    expect(state.requests).toEqual([]);
    expect(state.consumedRequestId).toBeGreaterThan(0);
    expect(state.items[0].favourite).toBe(true);
  });

  it('does not apply a request twice', async () => {
    const itemId = await importAndAnalyse('u1', 'shot.png', 'bytes');
    await appendRequest(paths, { kind: 'item.favourite', itemId, favourite: true });
    await coordinator.drain();
    await coordinator.drain();

    // A second drain over a consumed log must not re-run the analysis either.
    expect(runStructured).toHaveBeenCalledTimes(1);
  });
});

describe('deletion', () => {
  it('hides an item until it is restored, without touching its files', async () => {
    const itemId = await importAndAnalyse('u1', 'shot.png', 'bytes');

    await appendRequest(paths, { kind: 'item.delete', itemId });
    await coordinator.drain();
    expect((await readItem(paths, itemId))?.deletedAt).toBeGreaterThan(0);

    await appendRequest(paths, { kind: 'item.restore', itemId });
    await coordinator.drain();
    expect((await readItem(paths, itemId))?.deletedAt).toBeUndefined();
  });

  it('leaves a tombstone when an item is permanently deleted', async () => {
    const itemId = await importAndAnalyse('u1', 'shot.png', 'bytes');

    await appendRequest(paths, { kind: 'item.purge', itemId });
    await coordinator.drain();

    expect(await readItem(paths, itemId)).toBeNull();
    expect((await readState(paths)).items).toEqual([]);

    const tombstone = JSON.parse(await readFile(tombstoneFile(paths, itemId), 'utf8')) as {
      itemId: string;
      title: string;
    };
    expect(tombstone.itemId).toBe(itemId);
    expect(tombstone.title).toBe('Analysed title');
  });
});

describe('collections', () => {
  it('deleting a collection drops the grouping but keeps its references', async () => {
    const itemId = await importAndAnalyse('u1', 'shot.png', 'bytes');

    await appendRequest(paths, { kind: 'collection.create', collectionId: 'c1', name: 'Dashboards', colour: 'primary' });
    await appendRequest(paths, { kind: 'item.collect', itemId, collectionId: 'c1', member: true });
    await coordinator.drain();
    expect((await readState(paths)).items[0].collectionIds).toEqual(['c1']);

    await appendRequest(paths, { kind: 'collection.delete', collectionId: 'c1' });
    await coordinator.drain();

    const state = await readState(paths);
    expect(state.collections).toEqual([]);
    expect(state.items).toHaveLength(1);
    expect(state.items[0].collectionIds).toEqual([]);
  });
});

describe('failure handling', () => {
  it('records a failed analysis without losing the item', async () => {
    runStructured.mockResolvedValueOnce({ response: '', error: 'provider exploded' });

    await upload('u1', 'shot.png', 'bytes');
    await appendRequest(paths, { kind: 'ingest', uploadId: 'u1' });
    await coordinator.drain();

    const itemId = (await readState(paths)).items[0].id;
    await vi.waitFor(async () => {
      expect((await readItem(paths, itemId))?.analysis.status).toBe('failed');
    });
    expect((await readItem(paths, itemId))?.analysis.error).toBe('provider exploded');

    // The reason has to reach the grid, or the UI can only say "it failed".
    const summary = (await readState(paths)).items.find((entry) => entry.id === itemId);
    expect(summary?.analysisError).toBe('provider exploded');
  });

  it('keeps draining after one request fails', async () => {
    // An ingest naming an upload that does not exist must not stall the queue.
    await appendRequest(paths, { kind: 'ingest', uploadId: 'missing' });
    await appendRequest(paths, {
      kind: 'collection.create',
      collectionId: 'c1',
      name: 'Still applied',
      colour: 'primary',
    });
    await coordinator.drain();

    const state = await readState(paths);
    expect(state.collections.map((entry) => entry.name)).toEqual(['Still applied']);
    expect(state.requests).toEqual([]);
  });
});
