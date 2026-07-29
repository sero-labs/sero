import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../shared/paths';
import { readState } from '../shared/state-io';
import { createDesignRecord, mutateVariant, readDesign } from './design-store';
import { createDesign } from './designs';
import { TEST_BRIEF as BRIEF, seedItem } from './test-fixtures';

let home: string;
let paths: DesignLibraryPaths;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-design-store-'));
  paths = designLibraryPathsFromHome(home);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('the Design projection', () => {
  it('points the preview at the visible revision and counts its build warnings', async () => {
    await seedItem(paths, 'itm-a', { status: 'ready' });
    await createDesign(paths, {
      designId: 'dsn-1',
      title: 'Projected',
      brief: { ...BRIEF, variantCount: 1 },
      referenceItemIds: ['itm-a'],
      resolutions: [],
    });
    const design = await readDesign(paths, 'dsn-1');
    const variantId = design!.variants[0]!.id;

    await mutateVariant(paths, 'dsn-1', variantId, (variant) => ({
      ...variant,
      status: 'ready',
      visibleRevisionId: 'rev-old',
      revisions: [
        {
          id: 'rev-old',
          createdAt: 1,
          jobId: 'job-1',
          files: [{ name: 'index.html', bytes: 12 }],
          builtFile: 'preview.html',
          buildWarnings: ['Refused an import of `axios`.'],
          summary: 'first',
          name: '',
        },
        {
          id: 'rev-new',
          createdAt: 2,
          jobId: 'job-2',
          files: [{ name: 'index.html', bytes: 20 }],
          builtFile: 'preview.html',
          buildWarnings: [],
          summary: 'second',
          name: '',
        },
      ],
    }));

    const summary = (await readState(paths)).designs.find((entry) => entry.id === 'dsn-1');
    const variant = summary?.variants[0];
    expect(variant?.previewPath).toBe(
      `designs/dsn-1/variants/${variantId}/rev-old/preview.html`,
    );
    expect(variant?.warningCount).toBe(1);
    expect(variant?.revisionCount).toBe(2);
  });
});

describe('creating the same Design twice', () => {
  it('keeps the record that already exists rather than replacing it', async () => {
    await seedItem(paths, 'itm-a', { status: 'ready' });
    const input = {
      designId: 'dsn-1',
      title: 'First',
      brief: BRIEF,
      referenceItemIds: ['itm-a'],
      resolutions: [],
    };

    const first = await createDesign(paths, input);
    if (first.status !== 'created') throw new Error('seed failed');
    await mutateVariant(paths, 'dsn-1', first.design.variants[0]!.id, (variant) => ({
      ...variant,
      status: 'ready',
      revisions: [
        {
          id: 'rev-1',
          createdAt: 1,
          jobId: 'job-1',
          files: [{ name: 'index.html', bytes: 4 }],
          buildWarnings: [],
          summary: 'kept',
          name: '',
        },
      ],
    }));

    const replay = await createDesign(paths, { ...input, title: 'Second' });
    expect(replay.status).toBe('created');
    const stored = await readDesign(paths, 'dsn-1');
    expect(stored?.title).toBe('First');
    expect(stored?.variants[0]?.revisions).toHaveLength(1);
  });

  it('refuses to overwrite at the store, not only at the caller', async () => {
    await seedItem(paths, 'itm-a', { status: 'ready' });
    const created = await createDesign(paths, {
      designId: 'dsn-1',
      title: 'First',
      brief: BRIEF,
      referenceItemIds: ['itm-a'],
      resolutions: [],
    });
    if (created.status !== 'created') throw new Error('seed failed');

    const second = await createDesignRecord(paths, {
      ...created.design,
      title: 'Second',
      variants: [],
    });
    expect(second.created).toBe(false);
    expect(second.design.title).toBe('First');
    expect((await readDesign(paths, 'dsn-1'))?.title).toBe('First');
  });

  it('converges when two writers create the same id at once', async () => {
    await seedItem(paths, 'itm-a', { status: 'ready' });
    const created = await createDesign(paths, {
      designId: 'dsn-seed',
      title: 'Shape',
      brief: BRIEF,
      referenceItemIds: ['itm-a'],
      resolutions: [],
    });
    if (created.status !== 'created') throw new Error('seed failed');

    const [a, b] = await Promise.all([
      createDesignRecord(paths, { ...created.design, id: 'dsn-race', title: 'A' }),
      createDesignRecord(paths, { ...created.design, id: 'dsn-race', title: 'B' }),
    ]);

    expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
    const stored = await readDesign(paths, 'dsn-race');
    expect(a.design.title).toBe(stored?.title);
    expect(b.design.title).toBe(stored?.title);
  });

  it('is a no-op even when a reference has since been deleted', async () => {
    await seedItem(paths, 'itm-a', { status: 'ready' });
    await createDesign(paths, {
      designId: 'dsn-1',
      title: 'Made earlier',
      brief: BRIEF,
      referenceItemIds: ['itm-a'],
      resolutions: [],
    });
    await seedItem(paths, 'itm-a', { status: 'ready', deleted: true });

    const replay = await createDesign(paths, {
      designId: 'dsn-1',
      title: 'Made earlier',
      brief: BRIEF,
      referenceItemIds: ['itm-a'],
      resolutions: [],
    });
    expect(replay.status).toBe('created');
  });
});
