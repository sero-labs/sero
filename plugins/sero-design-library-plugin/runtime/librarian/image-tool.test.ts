import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppRuntimeHost } from '@sero-ai/common';
import type { ImageContent, TextContent } from '@earendil-works/pi-ai';

import { emptyAnalysis } from '../../shared/librarian';
import { designLibraryPathsFromHome, itemDir, type DesignLibraryPaths } from '../../shared/paths';
import type { ItemRecord } from '../../shared/records';
import { ITEM_SCHEMA_VERSION } from '../../shared/records';
import { createReferenceImageTool } from './image-tool';
import { invokeTool } from './test-support';

/**
 * A reference is often a full-window retina screenshot. Sending it untouched
 * costs a large slice of the context window, so it goes through the host's
 * image budget — the same one the chat panel and browser tools use.
 */

let home: string;
let paths: DesignLibraryPaths;
let prepareImage: ReturnType<typeof vi.fn>;

const ORIGINAL = Buffer.from('a-large-original-image-payload');

function record(): ItemRecord {
  const now = Date.now();
  return {
    id: 'itm-1',
    schemaVersion: ITEM_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    kind: 'image',
    source: { kind: 'file', fileName: 'shot.png' },
    asset: {
      originalFile: 'original.png',
      previewFile: 'preview.webp',
      mediaType: 'image/png',
      bytes: ORIGINAL.byteLength,
      checksum: 'checksum',
    },
    profile: { generated: emptyAnalysis('itm-1'), overrides: {} },
    analysis: { status: 'pending', attempts: 0 },
    favourite: false,
    collectionIds: [],
  };
}

/** A host that shrinks, as the desktop one does for anything oversized. */
function hostWithMedia(): AppRuntimeHost {
  prepareImage = vi.fn(async (_data: string, _mimeType: string, text?: string) => ({
    data: Buffer.from('smaller').toString('base64'),
    mimeType: 'image/jpeg',
    text: [text, '[Image: original 4000x3000, displayed at 1600x1200.]'].filter(Boolean).join('\n'),
    wasResized: true,
    width: 1600,
    height: 1200,
    originalWidth: 4000,
    originalHeight: 3000,
  }));
  return { media: { prepareImage } } as unknown as AppRuntimeHost;
}

function imageBlock(content: unknown): ImageContent {
  return (content as (TextContent | ImageContent)[]).find(
    (block): block is ImageContent => block.type === 'image',
  ) as ImageContent;
}

function textBlock(content: unknown): string {
  return (content as (TextContent | ImageContent)[])
    .filter((block): block is TextContent => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-image-'));
  paths = designLibraryPathsFromHome(home);
  await mkdir(itemDir(paths, 'itm-1'), { recursive: true });
  await writeFile(path.join(itemDir(paths, 'itm-1'), 'original.png'), ORIGINAL);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('handing the reference to the model', () => {
  it('sends the resized image, not the original bytes', async () => {
    const tool = createReferenceImageTool(hostWithMedia(), paths, record());
    const result = await invokeTool(tool.definition);

    expect(prepareImage).toHaveBeenCalledWith(
      ORIGINAL.toString('base64'),
      'image/png',
      expect.stringContaining('Analyse this image'),
    );
    const image = imageBlock(result.content);
    expect(image.data).toBe(Buffer.from('smaller').toString('base64'));
    expect(image.mimeType).toBe('image/jpeg');
  });

  it('passes on the note about the original dimensions', async () => {
    const tool = createReferenceImageTool(hostWithMedia(), paths, record());
    const result = await invokeTool(tool.definition);

    // Without this the model would describe a 4000px reference as 1600px.
    expect(textBlock(result.content)).toContain('original 4000x3000');
    expect(textBlock(result.content)).toContain('Analyse this image');
  });

  it('still counts as viewed, so the analysis is accepted', async () => {
    const tool = createReferenceImageTool(hostWithMedia(), paths, record());
    await invokeTool(tool.definition);
    expect(tool.wasViewed()).toBe(true);
  });

  it('sends the original when the host has no media capability', async () => {
    // An older shell, or a test harness. A bigger image costs more but still
    // analyses correctly, so this must not fail the run.
    const tool = createReferenceImageTool({} as AppRuntimeHost, paths, record());
    const result = await invokeTool(tool.definition);

    expect(imageBlock(result.content).data).toBe(ORIGINAL.toString('base64'));
    expect(tool.wasViewed()).toBe(true);
  });

  it('sends the original when resizing fails', async () => {
    const host = {
      media: { prepareImage: vi.fn(async () => Promise.reject(new Error('nativeImage unavailable'))) },
    } as unknown as AppRuntimeHost;
    const tool = createReferenceImageTool(host, paths, record());
    const result = await invokeTool(tool.definition);

    expect(imageBlock(result.content).data).toBe(ORIGINAL.toString('base64'));
    expect(tool.wasViewed()).toBe(true);
  });

  it('reports an unreadable image without calling the resizer', async () => {
    await rm(path.join(itemDir(paths, 'itm-1'), 'original.png'));
    const tool = createReferenceImageTool(hostWithMedia(), paths, record());
    const result = await invokeTool(tool.definition);

    expect('isError' in result && result.isError).toBe(true);
    expect(tool.wasViewed()).toBe(false);
    expect(prepareImage).not.toHaveBeenCalled();
  });
});
