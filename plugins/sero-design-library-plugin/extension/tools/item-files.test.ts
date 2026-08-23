import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';

import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../../shared/paths';
import { UPLOAD_CHUNK_BYTES } from '../../shared/uploads';
import { registerAssetTool } from './assets';

/**
 * Reading the files an item owns.
 *
 * The record names the file; that is not the same as the file being where the
 * record says, or being all there. Everything here is about the difference.
 */

let home: string;
let paths: DesignLibraryPaths;
let tools: Map<string, ToolDefinition>;

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
  home = await mkdtemp(path.join(tmpdir(), 'design-library-item-files-'));
  paths = designLibraryPathsFromHome(path.join(home, 'apps', 'design-library'));
  tools = new Map();
  registerAssetTool(
    {
      registerTool(definition: ToolDefinition) {
        tools.set(definition.name, definition);
      },
    } as unknown as ExtensionAPI,
    paths,
  );
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

/**
 * Reading a stored clip in slices (D4).
 *
 * A still comes back whole and that is fine at thumbnail size. A clip is
 * megabytes, and the `data:` URL a whole-file read produces cannot be seeked or
 * streamed — which is a player that renders and will not play. So it is read in
 * pieces the renderer can assemble into a Blob.
 */
describe('the asset tool streams an original in slices', () => {
  const CONTENT = Buffer.alloc(UPLOAD_CHUNK_BYTES + 1024, 7);

  async function seedClip(): Promise<string> {
    const id = 'itm-clip';
    const directory = path.join(paths.home, 'items', id);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'original.mp4'), CONTENT);
    await writeFile(
      path.join(directory, 'record.json'),
      JSON.stringify({
        id,
        schemaVersion: 1,
        createdAt: 0,
        updatedAt: 0,
        kind: 'video',
        source: { kind: 'generated', fileName: 'clip.mp4' },
        asset: {
          originalFile: 'original.mp4',
          previewFile: 'poster.webp',
          mediaType: 'video/mp4',
          bytes: CONTENT.byteLength,
          checksum: 'x',
        },
        analysis: { status: 'ready' },
        collectionIds: [],
      }),
      'utf8',
    );
    return id;
  }

  it('hands back ordered pieces that rebuild the file exactly', async () => {
    const id = await seedClip();
    const parts: Buffer[] = [];
    const identities: string[] = [];
    let offset = 0;
    let total = 0;

    for (let guard = 0; guard < 10; guard += 1) {
      const result = await call('design_library_assets', { action: 'stream', itemId: id, offset });
      const details = result.details as {
        total: number;
        bytes: number;
        data: string;
        mediaType: string;
        identity: string;
      };
      identities.push(details.identity);
      expect(details.mediaType).toBe('video/mp4');
      // Never more than one chunk at a time, whatever the file's size.
      expect(details.bytes).toBeLessThanOrEqual(UPLOAD_CHUNK_BYTES);
      total = details.total;
      parts.push(Buffer.from(details.data, 'base64'));
      offset += details.bytes;
      if (offset >= details.total || details.bytes === 0) break;
    }

    expect(total).toBe(CONTENT.byteLength);
    // Byte-for-byte, through `Buffer.equals` rather than `toEqual`: the deep
    // comparator walks half a megabyte one element at a time and costs about
    // half a second, while `equals` proves the same thing by memcmp.
    const rebuilt = Buffer.concat(parts);
    expect(rebuilt.byteLength).toBe(CONTENT.byteLength);
    expect(rebuilt.equals(CONTENT)).toBe(true);

    // The identity is what stops slices being stitched across two files, and
    // it has to actually come back: the caller rejects a slice without one, so
    // a reader that stopped sending it would fail rather than quietly lose the
    // protection. Every slice of one unchanged file says the same thing.
    expect(identities.every((entry) => typeof entry === 'string' && entry !== '')).toBe(true);
    expect(new Set(identities).size).toBe(1);
  }, 10_000);

  it('says nothing is left rather than failing, past the end', async () => {
    const id = await seedClip();
    const result = await call('design_library_assets', {
      action: 'stream',
      itemId: id,
      offset: CONTENT.byteLength + 5000,
    });

    expect(result.details).toMatchObject({ bytes: 0, total: CONTENT.byteLength });
  });

  it('refuses an offset that is not a byte position', async () => {
    const id = await seedClip();
    const result = await call('design_library_assets', { action: 'stream', itemId: id, offset: -1 });
    expect(textOf(result)).toContain('not a valid offset');
  });
});

describe('the asset tool will not follow a link out of its storage for an item', () => {
  async function seedItemPointingAt(target: string): Promise<string> {
    const id = 'itm-link';
    const directory = path.join(paths.home, 'items', id);
    await mkdir(directory, { recursive: true });
    await symlink(target, path.join(directory, 'original.mp4'));
    await writeFile(
      path.join(directory, 'record.json'),
      JSON.stringify({
        id,
        schemaVersion: 1,
        createdAt: 0,
        updatedAt: 0,
        kind: 'video',
        source: { kind: 'generated', fileName: 'clip.mp4' },
        asset: {
          originalFile: 'original.mp4',
          previewFile: 'original.mp4',
          mediaType: 'video/mp4',
          bytes: 9,
          checksum: 'x',
        },
        analysis: { status: 'ready' },
        collectionIds: [],
      }),
      'utf8',
    );
    return id;
  }

  it('refuses to stream or read a file that links somewhere else', async () => {
    const secret = path.join(home, 'outside.bin');
    await writeFile(secret, 'not yours', 'utf8');
    const id = await seedItemPointingAt(secret);

    // Every reader of an item's files, not only the new one: the record names
    // the file, and the record is not proof of where the file actually is.
    for (const action of ['stream', 'original', 'preview']) {
      const result = await call('design_library_assets', { action, itemId: id });
      expect(textOf(result)).toContain('outside the Design Library directory');
      expect(JSON.stringify(result)).not.toContain(Buffer.from('not yours').toString('base64'));
    }
  });
});

describe('the asset tool tells a missing file from a forbidden one', () => {
  it('says an item file is missing rather than out of bounds', async () => {
    const id = 'itm-gone';
    const directory = path.join(paths.home, 'items', id);
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, 'record.json'),
      JSON.stringify({
        id,
        schemaVersion: 1,
        createdAt: 0,
        updatedAt: 0,
        kind: 'video',
        source: { kind: 'generated', fileName: 'clip.mp4' },
        asset: {
          originalFile: 'original.mp4',
          previewFile: 'poster.webp',
          mediaType: 'video/mp4',
          bytes: 0,
          checksum: 'x',
        },
        analysis: { status: 'ready' },
        collectionIds: [],
      }),
      'utf8',
    );

    // Different news, and reporting the first as the second is both wrong and
    // the more alarming of the two.
    for (const action of ['stream', 'original', 'preview']) {
      const result = await call('design_library_assets', { action, itemId: id });
      expect(textOf(result)).toContain('is missing');
      expect(textOf(result)).not.toContain('outside the Design Library');
    }
  });
});
