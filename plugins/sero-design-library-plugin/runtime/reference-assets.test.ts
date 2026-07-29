import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  designAssetDir,
  designLibraryPathsFromHome,
  itemDir,
  type DesignLibraryPaths,
} from '../shared/paths';
import { createDesign } from './designs';
import { readDesign } from './design-store';
import { readAssetBytes } from './media/assets';
import { TEST_BRIEF, seedItem } from './test-fixtures';

let home: string;
let paths: DesignLibraryPaths;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-reference-assets-'));
  paths = designLibraryPathsFromHome(home);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('reference artwork boundary', () => {
  it('copies generated and derived images, but keeps imports language-only', async () => {
    await seedItem(paths, 'itm-upload', { status: 'ready' });
    await seedItem(paths, 'itm-generated', { status: 'ready', sourceKind: 'generated' });
    await seedItem(paths, 'itm-derived', { status: 'ready', sourceKind: 'derived' });

    const outcome = await createDesign(paths, {
      designId: 'dsn-1',
      title: '',
      brief: TEST_BRIEF,
      referenceItemIds: ['itm-upload', 'itm-generated', 'itm-derived'],
      resolutions: [],
    });

    expect(outcome.status).toBe('created');
    if (outcome.status !== 'created') return;
    expect(outcome.design.assets.map((asset) => asset.sourceItemId).toSorted()).toEqual([
      'itm-derived',
      'itm-generated',
    ]);
    expect(outcome.design.assets.some((asset) => asset.sourceItemId === 'itm-upload')).toBe(false);
  });

  it('owns its copy after the generated Library item is removed', async () => {
    await seedItem(paths, 'itm-generated', { status: 'ready', sourceKind: 'generated' });
    const outcome = await createDesign(paths, {
      designId: 'dsn-1',
      title: '',
      brief: TEST_BRIEF,
      referenceItemIds: ['itm-generated'],
      resolutions: [],
    });
    if (outcome.status !== 'created') throw new Error('Design was refused');
    const asset = outcome.design.assets[0]!;

    expect(
      await readFile(path.join(designAssetDir(paths, 'dsn-1', asset.id), 'source'), 'utf8'),
    ).toBe('seed-bytes');
    await rm(itemDir(paths, 'itm-generated'), { recursive: true, force: true });

    const stored = await readDesign(paths, 'dsn-1');
    expect(await readAssetBytes(paths, stored!)).toMatchObject([
      { reference: asset.reference, mediaType: 'image/png' },
    ]);
  });
});
