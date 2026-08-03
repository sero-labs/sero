import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';

import type { MediaModelCatalog } from '../../shared/media-model-catalog';
import { designLibraryPathsFromHome, secretsFile, type DesignLibraryPaths } from '../../shared/paths';
import { readStateWithIndexes, writeJsonFile } from '../../shared/state-io';
import { registerSettingsTool } from './settings';

/**
 * Settings is where the provider key is entered, and the key is the one value in
 * this plugin that must never reach reactive state (spec §8.3). That makes these
 * three actions the deliberate exception to the single-writer rule — they write
 * `secrets.json` directly rather than appending a request, because a request is
 * a line in `state.json` and the UI reads `state.json`.
 *
 * So the property under test is not "the key was saved". It is "the key is not
 * anywhere the UI can see", which is what the exception exists to buy.
 */

let home: string;
let paths: DesignLibraryPaths;
let tools: Map<string, ToolDefinition>;
const mediaModelCatalog: MediaModelCatalog = {
  async list() {
    return {
      'text-to-image': [{ id: 'image/model', label: 'Image model', provider: 'image' }],
      'reference-to-image': [],
      'image-to-image': [],
      upscale: [],
      'text-to-video': [],
      'image-to-video': [],
    };
  },
};

function collectTools(): ExtensionAPI {
  tools = new Map();
  return {
    registerTool(definition: ToolDefinition) {
      tools.set(definition.name, definition);
    },
  } as unknown as ExtensionAPI;
}

async function call(params: Record<string, unknown>) {
  const tool = tools.get('design_library_settings');
  if (!tool) throw new Error('design_library_settings was never registered');
  return tool.execute('test-call', params, new AbortController().signal, () => undefined, undefined as never);
}

function textOf(result: { content: Array<{ type: string }> }): string {
  const block = result.content.find((entry) => entry.type === 'text');
  return block && 'text' in block ? String(block.text) : '';
}

const SECRET = 'fal-key-value-nobody-should-see';
let savedKey: string | undefined;

beforeEach(async () => {
  // The status is environment-first, so a real `FAL_KEY` on the machine running
  // the tests would make every assertion here read `env`.
  savedKey = process.env.FAL_KEY;
  delete process.env.FAL_KEY;
  home = await mkdtemp(path.join(tmpdir(), 'design-library-settings-tool-'));
  paths = designLibraryPathsFromHome(path.join(home, 'apps', 'design-library'));
  registerSettingsTool(collectTools(), paths, mediaModelCatalog);
});

afterEach(async () => {
  if (savedKey === undefined) delete process.env.FAL_KEY;
  else process.env.FAL_KEY = savedKey;
  await rm(home, { recursive: true, force: true });
});

describe('the provider key', () => {
  it('never appears in state, in the request log or in the tool result', async () => {
    const stored = await call({ action: 'store-key', key: SECRET });

    expect(textOf(stored)).not.toContain(SECRET);
    expect(JSON.stringify(stored)).not.toContain(SECRET);
    // The whole state file, not just the requests: a key that reached any part
    // of it would be readable by the UI.
    const state = await readStateWithIndexes(paths);
    expect(JSON.stringify(state)).not.toContain(SECRET);
    expect(state.requests).toEqual([]);
    // It did get saved, though — in the file that is not reactive state.
    expect(await readFile(secretsFile(paths), 'utf8')).toContain(SECRET);
  });

  it('reports where the key came from and nothing else', async () => {
    expect((await call({ action: 'key-status' })).details).toMatchObject({ status: 'missing' });

    await call({ action: 'store-key', key: SECRET });
    expect((await call({ action: 'key-status' })).details).toMatchObject({ status: 'stored' });

    await call({ action: 'clear-key' });
    expect((await call({ action: 'key-status' })).details).toMatchObject({ status: 'missing' });
  });

  it('says the environment wins when a key is stored behind one', async () => {
    process.env.FAL_KEY = 'from-the-environment';

    const result = await call({ action: 'store-key', key: SECRET });

    // Saying "saved" here would make a stale stored key look like the cause of
    // the next failure, when the environment is what is actually being used.
    expect(textOf(result)).toContain('environment takes precedence');
    expect(result.details).toMatchObject({ status: 'env' });
  });

  it('refuses an empty key rather than storing one', async () => {
    const result = await call({ action: 'store-key', key: '   ' });

    expect(textOf(result)).toContain('needs a key');
    expect((await call({ action: 'key-status' })).details).toMatchObject({ status: 'missing' });
  });
});

describe('media settings', () => {
  it('returns provider-neutral model choices', async () => {
    expect((await call({ action: 'list-media-models' })).details).toMatchObject({
      models: {
        'text-to-image': [{ id: 'image/model', label: 'Image model', provider: 'image' }],
      },
    });
  });

  it('sets one capability’s model without disturbing the others', async () => {
    await call({ action: 'set-media-model', capability: 'text-to-video', mediaModel: 'fast-video' });

    const [queued] = (await readStateWithIndexes(paths)).requests;
    expect(queued?.body).toMatchObject({
      kind: 'settings.update',
      patch: { media: { models: { 'text-to-video': 'fast-video' } } },
    });
    // The other capabilities keep whatever they had, rather than being cleared by a
    // patch that only named one.
    const patch = (queued?.body as { patch: { media: { models: Record<string, string> } } }).patch;
    expect(Object.keys(patch.media.models)).toHaveLength(6);
  });

  it('keeps the per-run cap inside its range', async () => {
    expect(textOf(await call({ action: 'set-media-cap', callsPerRun: -1 }))).toContain('must be 0');
    expect(textOf(await call({ action: 'set-media-cap', callsPerRun: 999 }))).toContain('must be 0');
    expect((await readStateWithIndexes(paths)).requests).toEqual([]);

    await call({ action: 'set-media-cap', callsPerRun: 3 });
    expect((await readStateWithIndexes(paths)).requests[0]?.body).toMatchObject({
      patch: { media: { callsPerRun: 3 } },
    });
  });
});

describe('saved view preferences', () => {
  it('lets the agent set the Library query', async () => {
    await call({ action: 'set-view', view: { query: 'editorial grid' } });

    expect((await readStateWithIndexes(paths)).requests[0]?.body).toEqual({
      kind: 'view.set',
      patch: { query: 'editorial grid' },
    });
  });
});

describe('index repair', () => {
  it('lets the agent schedule a full repair for the next restart', async () => {
    await writeJsonFile(paths.repairFailedFile, { attempts: 3 });
    const result = await call({ action: 'repair-indexes' });

    expect(textOf(result)).toContain('next Sero restart');
    expect(await readFile(paths.repairRequestFile, 'utf8')).toContain('requestedAt');
    await expect(readFile(paths.repairFailedFile, 'utf8')).rejects.toThrow();
    expect((await readStateWithIndexes(paths)).requests).toEqual([]);
  });
});
