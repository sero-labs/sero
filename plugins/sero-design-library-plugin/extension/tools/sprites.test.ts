/**
 * The tool answers the calls the page actually makes.
 *
 * This exists because it did not. The tool took `filePath` and the page sends
 * `path`, so every picture request was refused and both panes of the character
 * sheet were simply empty — no error, no broken image, nothing. Types could not
 * catch it: the payload crosses a tool boundary as JSON.
 *
 * So the payloads below are copied from the page's own call sites, and the test
 * fails if either side is renamed without the other.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../../shared/paths';
import { encodeIndexedPng } from '../../sprite-studio/runtime/png';
import { characterRecordFile } from '../../sprite-studio/shared/paths';
import { registerSpriteTool } from './sprites';

interface Registered {
  execute(id: string, params: unknown): Promise<{ content: unknown[]; details: Record<string, unknown> }>;
}

let home: string;
let paths: DesignLibraryPaths;
let tool: Registered;

beforeAll(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'sprite-tool-'));
  paths = designLibraryPathsFromHome(home);

  const pi = {
    registerTool(definition: unknown) {
      tool = definition as Registered;
    },
  } as unknown as ExtensionAPI;
  registerSpriteTool(pi, paths);

  await mkdir(path.dirname(characterRecordFile(paths, 'chr1')), { recursive: true });
  await writeFile(
    characterRecordFile(paths, 'chr1'),
    JSON.stringify({ id: 'chr1', name: 'Explorer', artWidth: 4, artHeight: 3, palette: ['#3f6b34'] }),
  );
  const cells = Int16Array.from([0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 0]);
  await writeFile(
    path.join(home, 'characters', 'chr1', 'base-pose.png'),
    encodeIndexedPng(cells, 4, 3, [[63, 107, 52]]),
  );
});

afterAll(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('the calls the page makes', () => {
  it('returns a picture for `asset` with `path`', async () => {
    // `ui/lib/requests.ts`: tools.run(SPRITE_TOOL, { action: 'asset', path })
    const result = await tool.execute('1', {
      action: 'asset',
      path: 'characters/chr1/base-pose.png',
    });
    const block = result.content.find(
      (entry): entry is { type: 'image'; data: string; mimeType: string } =>
        (entry as { type?: string }).type === 'image',
    );
    expect(block, 'the page looks for an image block and found none').toBeDefined();
    expect(block!.mimeType).toBe('image/png');
    expect(block!.data.length).toBeGreaterThan(0);
  });

  it('returns cells and a palette for `frame` with `path`', async () => {
    // `ui/hooks/useSpriteAsset.ts`: { action: 'frame', path: key }
    const result = await tool.execute('2', {
      action: 'frame',
      path: 'characters/chr1/base-pose.png',
    });
    expect(result.details).toMatchObject({ ok: true, cols: 4, rows: 3 });
    expect((result.details.cells as number[]).length).toBe(12);
    expect(result.details.palette).toEqual(['#3f6b34']);
  });

  it('returns the record for `record` with `characterId`', async () => {
    // `ui/hooks/useSpriteRecord.ts`: { action: 'record', characterId }
    const result = await tool.execute('3', { action: 'record', characterId: 'chr1' });
    expect((result.details.character as { name: string }).name).toBe('Explorer');
  });

  it('refuses a path outside plugin storage', async () => {
    const result = await tool.execute('4', { action: 'asset', path: '../../../etc/passwd' });
    expect(result.details.ok).toBe(false);
  });

  it('accepts a staged chunk for `stage`', async () => {
    // `ui/lib/requests.ts`: { action: 'stage', key, name, index, data }
    const result = await tool.execute('5', {
      action: 'stage',
      key: 'ref1',
      name: '000',
      index: 0,
      data: Buffer.from('hello').toString('base64'),
    });
    expect(result.details).toMatchObject({ ok: true, bytes: 5 });
  });
});
