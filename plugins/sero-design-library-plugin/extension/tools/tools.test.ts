import { mkdtemp, rm, writeFile, mkdir, access, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';

import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../../shared/paths';
import { readState } from '../../shared/state-io';
import { registerAssetTool } from './assets';
import { registerItemTool } from './items';

/**
 * The tool surface is what an agent reaches, so the guards are tested there and
 * not only in the helpers underneath. Every id here builds a filesystem path,
 * and every value here ends up in a record.
 */

let home: string;
let paths: DesignLibraryPaths;
let tools: Map<string, ToolDefinition>;

/** Collect whatever the extension registers, so a tool can be invoked directly. */
function collectTools(): ExtensionAPI {
  tools = new Map();
  return {
    registerTool(definition: ToolDefinition) {
      tools.set(definition.name, definition);
    },
  } as unknown as ExtensionAPI;
}

async function call(name: string, params: Record<string, unknown>) {
  const tool = tools.get(name);
  if (!tool) throw new Error(`${name} was never registered`);
  return tool.execute('test-call', params, new AbortController().signal, () => undefined, undefined as never);
}

function textOf(result: { content: Array<{ type: string }> }): string {
  const block = result.content.find((entry) => entry.type === 'text');
  return block && 'text' in block ? String(block.text) : '';
}

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-tools-'));
  paths = designLibraryPathsFromHome(path.join(home, 'apps', 'design-library'));
  const pi = collectTools();
  registerAssetTool(pi, paths);
  registerItemTool(pi, paths);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

const TRAVERSAL = '../../..';

describe('the asset tool refuses unsafe ids', () => {
  it('will not abort an upload outside the uploads directory', async () => {
    const bystander = path.join(home, 'profile-data.json');
    await writeFile(bystander, '{}', 'utf8');
    await mkdir(paths.uploadsDir, { recursive: true });

    const result = await call('design_library_assets', { action: 'abort', uploadId: TRAVERSAL });

    expect(textOf(result)).toContain('not a valid upload id');
    // The whole point: the directory it would have deleted is still there.
    await expect(access(bystander)).resolves.toBeUndefined();
  });

  it('rejects a traversal on chunk, complete, preview and original', async () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['chunk', { action: 'chunk', uploadId: TRAVERSAL, index: 0, data: 'AAAA' }],
      ['complete', { action: 'complete', uploadId: TRAVERSAL }],
      ['preview', { action: 'preview', itemId: TRAVERSAL }],
      ['original', { action: 'original', itemId: TRAVERSAL }],
    ];
    for (const [label, params] of cases) {
      const result = await call('design_library_assets', params);
      expect(textOf(result), label).toMatch(/not a valid (upload|item) id/);
    }
  });

  it('still accepts a legitimate upload', async () => {
    const begun = await call('design_library_assets', {
      action: 'begin',
      fileName: 'shot.png',
      mediaType: 'image/png',
      originalChunks: 1,
    });
    const uploadId = (begun.details as { uploadId?: string }).uploadId;
    expect(typeof uploadId).toBe('string');

    const chunk = await call('design_library_assets', {
      action: 'chunk',
      uploadId,
      index: 0,
      data: Buffer.from('bytes').toString('base64'),
    });
    expect(textOf(chunk)).toContain('Stored original chunk 0');
  });
});

describe('the asset tool refuses unsupported media', () => {
  it('will not begin an upload for a video', async () => {
    const result = await call('design_library_assets', {
      action: 'begin',
      fileName: 'clip.mp4',
      mediaType: 'video/mp4',
      originalChunks: 1,
    });
    expect(textOf(result)).toContain('Only images can be imported');
  });

  it('will not begin an upload for a non-image file', async () => {
    const result = await call('design_library_assets', {
      action: 'begin',
      fileName: 'notes.txt',
      mediaType: 'text/plain',
      originalChunks: 1,
    });
    expect(textOf(result)).toContain('Only images can be imported');
  });
});

describe('the item tool refuses unsafe ids', () => {
  it('rejects a traversal on every action that names an item', async () => {
    for (const action of ['get', 'favourite', 'delete', 'restore', 'purge', 'reset-field']) {
      const result = await call('design_library_items', { action, itemId: TRAVERSAL, field: 'title' });
      expect(textOf(result), action).toContain('not a valid item id');
    }
  });

  it('rejects a traversal in a collection id', async () => {
    const result = await call('design_library_items', {
      action: 'delete-collection',
      collectionId: TRAVERSAL,
    });
    expect(textOf(result)).toContain('not a valid collection id');
  });

  it('queues nothing when an id is refused', async () => {
    await call('design_library_items', { action: 'purge', itemId: TRAVERSAL });
    expect((await readState(paths)).requests).toEqual([]);
  });
});

describe('the item tool validates field values', () => {
  it('rejects a value of the wrong shape', async () => {
    const result = await call('design_library_items', {
      action: 'set-field',
      itemId: 'abc-123',
      field: 'tags',
      value: 99,
    });
    expect(textOf(result)).toContain('`tags` expects an array of strings');
    expect((await readState(paths)).requests).toEqual([]);
  });

  it('rejects an unknown field name', async () => {
    const result = await call('design_library_items', {
      action: 'set-field',
      itemId: 'abc-123',
      field: 'notAField',
      value: 'x',
    });
    expect(textOf(result)).toContain('set-field` needs one of');
  });

  it('queues a well-formed override', async () => {
    await call('design_library_items', {
      action: 'set-field',
      itemId: 'abc-123',
      field: 'tags',
      value: ['dense', 'editorial'],
    });
    const [request] = (await readState(paths)).requests;
    expect(request?.body).toMatchObject({ kind: 'item.set-field', field: 'tags' });
  });
});

describe('the asset tool guards design files', () => {
  it('refuses a traversal in any id or the file name', async () => {
    const valid = { designId: 'dsn-1', variantId: 'var-1', revisionId: 'rev-1', fileName: 'preview.html' };

    for (const key of ['designId', 'variantId', 'revisionId'] as const) {
      const result = await call('design_library_assets', {
        action: 'design-file',
        ...valid,
        [key]: TRAVERSAL,
      });
      expect(textOf(result), key).toMatch(/not a valid (design|variant|revision) id/);
    }

    const named = await call('design_library_assets', {
      action: 'design-file',
      ...valid,
      fileName: '../../../state.json',
    });
    expect(textOf(named)).toContain('not a valid file name');
  });

  it('reads a file the runtime wrote into a revision', async () => {
    const directory = path.join(
      paths.home,
      'designs',
      'dsn-1',
      'variants',
      'var-1',
      'rev-1',
    );
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'preview.html'), '<!doctype html><body>ok</body>', 'utf8');

    const result = await call('design_library_assets', {
      action: 'design-file',
      designId: 'dsn-1',
      variantId: 'var-1',
      revisionId: 'rev-1',
      fileName: 'preview.html',
    });

    // Text, not base64: an inlined React page runs to hundreds of kilobytes and
    // base64 would inflate it by a third for nothing.
    expect(textOf(result)).toContain('<body>ok</body>');
  });

  it('reports a file that is not there rather than returning nothing', async () => {
    const result = await call('design_library_assets', {
      action: 'design-file',
      designId: 'dsn-1',
      variantId: 'var-1',
      revisionId: 'rev-nope',
      fileName: 'preview.html',
    });

    expect(textOf(result)).toContain('No file preview.html');
  });
});

describe('the asset tool will not follow a link out of its storage', () => {
  it('refuses a revision file that is a symlink to somewhere else', async () => {
    const secret = path.join(home, 'outside.txt');
    await writeFile(secret, 'not yours', 'utf8');
    const directory = path.join(paths.home, 'designs', 'dsn-1', 'variants', 'var-1', 'rev-1');
    await mkdir(directory, { recursive: true });
    await symlink(secret, path.join(directory, 'preview.html'));

    const result = await call('design_library_assets', {
      action: 'design-file',
      designId: 'dsn-1',
      variantId: 'var-1',
      revisionId: 'rev-1',
      fileName: 'preview.html',
    });

    // A lexical path check cannot see this; only resolving the real path can.
    expect(textOf(result)).toContain('outside the Design Library directory');
    expect(textOf(result)).not.toContain('not yours');
  });
});
