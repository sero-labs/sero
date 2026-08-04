import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { DesignIndexEntry, ItemIndexEntry } from './indexes';
import { designLibraryPathsFromHome } from './paths';
import { selectItems } from './search';
import { readStateWithIndexes, writeJsonFile } from './state-io';
import { EMPTY_FILTERS } from './types';

const homes: string[] = [];
afterEach(async () => Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true }))));

describe('large compact indexes', () => {
  it('keeps 5,000 items and 1,000 Designs out of control state', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'design-library-scale-'));
    homes.push(home);
    const paths = designLibraryPathsFromHome(home);
    const items: ItemIndexEntry[] = Array.from({ length: 5_000 }, (_, index) => ({
      id: `item-${index}`, title: `Reference ${index}`, fileName: `source-${index}.png`,
      primaryStyle: index % 2 === 0 ? 'Editorial' : 'Technical', tags: [`tag-${index % 20}`, `tag-${index % 50}`],
      designTypes: ['Landing'], kind: 'image', previewPath: `items/item-${index}/preview.webp`,
      analysisStatus: 'ready', favourite: false, collectionIds: [], colours: [], sourceKind: 'file',
      createdAt: index, updatedAt: index, edited: false,
    }));
    const designs: DesignIndexEntry[] = Array.from({ length: 1_000 }, (_, index) => ({
      id: `design-${index}`, title: `Design ${index}`, target: 'html', variationMode: 'blend',
      referenceItemIds: [`item-${index}`], variants: [], createdAt: index, updatedAt: index,
    }));
    await writeJsonFile(paths.itemsIndexFile, items);
    await writeJsonFile(paths.designsIndexFile, designs);
    await writeJsonFile(paths.stateFile, await readStateWithIndexes(paths));

    const selected = selectItems(items, {
      scope: { kind: 'all' }, filters: { ...EMPTY_FILTERS, tags: ['tag-8'] },
      sort: 'newest', query: 'editorial landing source',
    });
    expect(selected.length).toBeGreaterThan(0);
    const state = JSON.parse(await readFile(paths.stateFile, 'utf8')) as Record<string, unknown>;
    expect(state).not.toHaveProperty('items');
    expect(state).not.toHaveProperty('designs');
    expect((await readFile(paths.stateFile, 'utf8')).length).toBeLessThan(10_000);
  });
});
