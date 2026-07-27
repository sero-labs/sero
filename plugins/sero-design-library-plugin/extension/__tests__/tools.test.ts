/**
 * The tool surface is read-and-intent only. These tests hold that contract:
 * a write action appends a request and mutates no domain record.
 */

import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAssetsTool, MAX_CHUNK_BASE64_LENGTH } from '../tools/assets';
import { createAnalysisTool, createItemsTool } from '../tools/items';
import { createDesignsTool } from '../tools/designs';
import { createExportTool, createGalleryTool } from '../tools/gallery';
import { createSettingsTool } from '../tools/settings';
import { mutateRecord, mutateState, readState } from '../../shared/state-io';
import { designRecordPath, itemRecordPath, storagePathsFromRoot } from '../../shared/paths';
import type { DesignRecord, LibraryItemRecord } from '../../shared/records';
import type { ToolOutput } from '../context';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let root = '';
let paths = storagePathsFromRoot('/tmp/unused');
const ctx = { cwd: '' };

async function run(
  tool: { execute: (...args: never[]) => unknown },
  params: Record<string, unknown>,
): Promise<ToolOutput> {
  return (tool.execute as unknown as (
    id: string,
    params: Record<string, unknown>,
    signal: undefined,
    onUpdate: undefined,
    context: { cwd: string },
  ) => Promise<ToolOutput>)('call-1', params, undefined, undefined, ctx);
}

function text(result: ToolOutput): string {
  const block = result.content.find((entry) => entry.type === 'text');
  return block && 'text' in block ? block.text : '';
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'dl-tools-'));
  paths = storagePathsFromRoot(path.join(root, 'apps', 'design-library'));
  process.env.SERO_HOME = root;
  ctx.cwd = root;
});

afterEach(() => {
  delete process.env.SERO_HOME;
});

describe('design_library_assets', () => {
  const tool = createAssetsTool();

  it('runs the whole bounded upload pipeline and queues one ingest request', async () => {
    const begin = await run(tool, {
      action: 'upload_begin',
      fileName: 'reference.png',
      mimeType: 'image/png',
      source: 'drag-drop',
    });
    const uploadId = begin.details.uploadId as string;
    expect(uploadId).toMatch(/^upl-/);
    expect(begin.details.maxChunkLength).toBe(MAX_CHUNK_BASE64_LENGTH);

    await run(tool, { action: 'upload_chunk', uploadId, chunk: PNG_BASE64 });
    const finish = await run(tool, { action: 'upload_finish', uploadId });

    expect(finish.details.duplicate).toBe(false);
    const state = await readState(paths.stateFile);
    expect(state?.requests).toHaveLength(1);
    expect(state?.requests[0].action).toBe('item.ingest-upload');
    expect(state?.requests[0].payload).toMatchObject({ uploadId, source: 'drag-drop' });
  });

  it('refuses a non-image import', async () => {
    const result = await run(tool, {
      action: 'upload_begin',
      fileName: 'notes.txt',
      mimeType: 'text/plain',
    });
    expect(text(result)).toContain('imports images only');
  });

  it('refuses an oversized chunk', async () => {
    const begin = await run(tool, {
      action: 'upload_begin',
      fileName: 'a.png',
      mimeType: 'image/png',
    });
    const result = await run(tool, {
      action: 'upload_chunk',
      uploadId: begin.details.uploadId,
      chunk: 'A'.repeat(MAX_CHUNK_BASE64_LENGTH + 1),
    });
    expect(text(result)).toContain('character limit');
  });

  it('opens the existing item when the same image is imported twice', async () => {
    const checksum = createHash('sha256').update(Buffer.from(PNG_BASE64, 'base64')).digest('hex');
    await mutateState(paths.stateFile, (current) => ({
      ...current,
      items: [{
        id: 'itm-existing',
        title: 'Existing',
        primaryStyle: '',
        tags: [],
        source: 'file-picker',
        colours: [],
        analysisStatus: 'ready',
        createdAt: 1,
        checksum,
      }],
    }));

    const begin = await run(tool, {
      action: 'upload_begin',
      fileName: 'reference.png',
      mimeType: 'image/png',
    });
    const uploadId = begin.details.uploadId as string;
    await run(tool, { action: 'upload_chunk', uploadId, chunk: PNG_BASE64 });
    const finish = await run(tool, { action: 'upload_finish', uploadId });

    expect(finish.details).toMatchObject({ duplicate: true, itemId: 'itm-existing' });
    const state = await readState(paths.stateFile);
    expect(state?.requests ?? []).toHaveLength(0);
  });

  it('returns a stored preview as an image block', async () => {
    const itemId = 'itm-read';
    const dir = path.join(paths.items, itemId);
    await mutateRecord<LibraryItemRecord>(itemRecordPath(paths, itemId), () => ({
      revision: 0,
      id: itemId,
      createdAt: 1,
      updatedAt: 1,
      source: 'file-picker',
      originalFileName: 'reference.png',
      original: { fileName: 'original.png', mimeType: 'image/png', byteLength: 70, checksum: 'x' },
      preview: { fileName: 'original.png', mimeType: 'image/png', byteLength: 70, checksum: 'x' },
      analysisStatus: 'ready',
      analysisAttempts: 1,
    }));
    await writeFile(path.join(dir, 'original.png'), Buffer.from(PNG_BASE64, 'base64'));

    const result = await run(tool, { action: 'read_preview', itemId });
    const image = result.content.find((entry) => entry.type === 'image');
    expect(image).toMatchObject({ mimeType: 'image/png' });
  });

  it('rejects an id that would escape the storage root', async () => {
    await expect(run(tool, { action: 'read_preview', itemId: '../../etc' })).rejects.toThrow('Invalid itemId');
  });
});

describe('design_library_items and analysis', () => {
  it('queues a field override and its reset without touching the record', async () => {
    const items = createItemsTool();
    await run(items, { action: 'update_field', itemId: 'itm-1', field: 'title', value: 'Mine' });
    await run(items, { action: 'reset_field', itemId: 'itm-1', field: 'title' });

    const state = await readState(paths.stateFile);
    expect(state?.requests.map((entry) => entry.action)).toEqual([
      'item.update-field',
      'item.reset-field',
    ]);
    await expect(readFile(itemRecordPath(paths, 'itm-1'), 'utf8')).rejects.toThrow();
  });

  it('rejects an unknown field', async () => {
    const items = createItemsTool();
    const result = await run(items, { action: 'update_field', itemId: 'itm-1', field: 'nope', value: 1 });
    expect(text(result)).toContain('Unknown editable field');
  });

  it('distinguishes analyse from reanalyse', async () => {
    const analysis = createAnalysisTool();
    await run(analysis, { action: 'analyse', itemId: 'itm-1' });
    await run(analysis, { action: 'reanalyse', itemId: 'itm-1' });

    const state = await readState(paths.stateFile);
    expect(state?.requests.map((entry) => entry.payload.reanalyse)).toEqual([false, true]);
  });
});

describe('design_library_designs', () => {
  const designs = createDesignsTool();

  it('refuses more than six references', async () => {
    const result = await run(designs, {
      action: 'create',
      request: 'a page',
      itemIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    });
    expect(text(result)).toContain('at most six references');
  });

  async function seedDesignWithTweaks(): Promise<{ designId: string; variantId: string }> {
    const designId = 'dsn-1';
    const variantId = 'var-1';
    const revisionId = 'rev-1';
    await mutateRecord<DesignRecord>(designRecordPath(paths, designId), () => ({
      revision: 0,
      id: designId,
      title: 'Design',
      request: 'a page',
      outputTarget: 'html',
      references: [],
      conflicts: [],
      assets: [],
      createdAt: 1,
      updatedAt: 1,
      variants: [{
        id: variantId,
        title: 'Variant 1',
        status: 'succeeded',
        visibleRevisionId: revisionId,
        revisions: [{
          id: revisionId,
          variantId,
          revisionNumber: 1,
          outputTarget: 'html',
          files: [],
          assetIds: [],
          droppedTweakControls: [],
          tweakOverrides: {},
          createdAt: 1,
          createdReason: 'generated',
          tweakManifest: {
            schemaVersion: 1,
            variantRevisionId: revisionId,
            controls: [{
              id: 'gap',
              group: 'Rhythm',
              label: 'Gap',
              cssVariable: '--gap',
              control: { type: 'range', min: 0, max: 4, step: 1, unit: 'rem' },
              defaultValue: 1,
            }],
          },
        }],
      }],
    }));
    return { designId, variantId };
  }

  it('accepts only declared tweak ids with admissible values', async () => {
    const { designId, variantId } = await seedDesignWithTweaks();

    const accepted = await run(designs, {
      action: 'update_tweak',
      designId,
      variantId,
      overrides: { gap: 3, unknown: 'x', 'gap-2': 99 },
    });
    expect(accepted.details.applied).toEqual({ gap: 3 });
    expect(accepted.details.rejected).toHaveLength(2);

    const refused = await run(designs, {
      action: 'update_tweak',
      designId,
      variantId,
      overrides: { gap: 99 },
    });
    expect(text(refused)).toContain('No usable tweak values');
  });

  it('returns the effective override block for Copy CSS', async () => {
    const { designId, variantId } = await seedDesignWithTweaks();

    const atDefaults = await run(designs, { action: 'copy_tweak_css', designId, variantId });
    expect(text(atDefaults)).toContain('generated defaults');

    await mutateRecord<DesignRecord>(designRecordPath(paths, designId), (current) => ({
      ...current!,
      variants: current!.variants.map((variant) => ({
        ...variant,
        revisions: variant.revisions.map((revision) => ({ ...revision, tweakOverrides: { gap: 3 } })),
      })),
    }));

    const withOverride = await run(designs, { action: 'copy_tweak_css', designId, variantId });
    expect(text(withOverride)).toBe(':root {\n  --gap: 3rem;\n}\n');
  });
});

describe('design_library_gallery and export', () => {
  it('queues a Gallery save for a specific variant', async () => {
    await run(createGalleryTool(), { action: 'save', designId: 'dsn-1', variantId: 'var-1' });
    const state = await readState(paths.stateFile);
    expect(state?.requests[0]).toMatchObject({
      action: 'gallery.save',
      payload: { designId: 'dsn-1', variantId: 'var-1' },
    });
  });

  it('queues an export with the chosen destination', async () => {
    await run(createExportTool(), {
      familyId: 'fam-1',
      versionId: 'ver-1',
      destination: 'downloads',
    });
    const state = await readState(paths.stateFile);
    expect(state?.requests[0].payload).toMatchObject({ destination: 'downloads' });
  });
});

describe('design_library_settings', () => {
  const settings = createSettingsTool();

  it('queues a settings change', async () => {
    await run(settings, { action: 'set', variantCount: 5, revisionBehaviour: 'retain' });
    const state = await readState(paths.stateFile);
    expect(state?.requests[0]).toMatchObject({
      action: 'settings.update',
      payload: { variantCount: 5, revisionBehaviour: 'retain' },
    });
  });

  it('rejects a variant count outside the approved range', async () => {
    const result = await run(settings, { action: 'set', variantCount: 9 });
    expect(text(result)).toContain('whole number from 1 to 5');
  });
});
