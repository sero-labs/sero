import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { designLibraryPathsFromHome, revisionDir, type DesignLibraryPaths } from '../shared/paths';
import { readState } from '../shared/state-io';
import {
  createDesignRecord,
  mutateVariant,
  pruneOrphanRevisions,
  readDesign,
} from './design-store';
import { cancelVariant, createDesign, retryVariant } from './designs';
import { TEST_BRIEF as BRIEF, seedItem } from './test-fixtures';

let home: string;
let paths: DesignLibraryPaths;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-designs-'));
  paths = designLibraryPathsFromHome(home);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('creating a Design', () => {
  it('refuses a reference that has not been analysed', async () => {
    await seedItem(paths, 'itm-ready', { status: 'ready' });
    await seedItem(paths, 'itm-pending', { status: 'pending' });

    const outcome = await createDesign(paths, {
      designId: 'dsn-1',
      title: '',
      brief: BRIEF,
      referenceItemIds: ['itm-ready', 'itm-pending'],
      resolutions: [],
    });

    expect(outcome.status).toBe('refused');
    expect(await readDesign(paths, 'dsn-1')).toBeNull();
  });

  it('refuses a reference in Trash', async () => {
    await seedItem(paths, 'itm-gone', { status: 'ready', deleted: true });

    const outcome = await createDesign(paths, {
      designId: 'dsn-1',
      title: '',
      brief: BRIEF,
      referenceItemIds: ['itm-gone'],
      resolutions: [],
    });

    expect(outcome.status).toBe('refused');
  });

  it('refuses while a guardrail conflict is unresolved, and accepts once it is', async () => {
    await seedItem(paths, 'itm-a', { status: 'ready', always: ['Use generous whitespace'] });
    await seedItem(paths, 'itm-b', { status: 'ready', never: ['use generous whitespace.'] });

    const blocked = await createDesign(paths, {
      designId: 'dsn-1',
      title: '',
      brief: BRIEF,
      referenceItemIds: ['itm-a', 'itm-b'],
      resolutions: [],
    });
    expect(blocked.status).toBe('refused');

    const allowed = await createDesign(paths, {
      designId: 'dsn-2',
      title: '',
      brief: BRIEF,
      referenceItemIds: ['itm-a', 'itm-b'],
      resolutions: [{ rule: 'Use generous whitespace', keep: 'always' }],
    });

    expect(allowed.status).toBe('created');
    const design = await readDesign(paths, 'dsn-2');
    expect(design?.appliedGuardrails.always).toEqual(['Use generous whitespace']);
    expect(design?.appliedGuardrails.never).toEqual([]);
    // The kept side and the dropped reference are both recorded, so "why is this
    // Design ignoring that rule" stays answerable later.
    expect(design?.appliedGuardrails.resolved).toEqual([
      { rule: 'Use generous whitespace', keptFromItemId: 'itm-a', droppedFromItemIds: ['itm-b'] },
    ]);
  });

  it('freezes the guardrails against a later edit to a reference', async () => {
    await seedItem(paths, 'itm-a', { status: 'ready', always: ['Keep the type scale tight'] });
    await createDesign(paths, {
      designId: 'dsn-1',
      title: '',
      brief: BRIEF,
      referenceItemIds: ['itm-a'],
      resolutions: [],
    });

    await seedItem(paths, 'itm-a', { status: 'ready', always: ['Something else entirely'] });

    const design = await readDesign(paths, 'dsn-1');
    expect(design?.appliedGuardrails.always).toEqual(['Keep the type scale tight']);
  });

  it('gives per-reference mode one variant per reference, whatever the count asked for', async () => {
    await seedItem(paths, 'itm-a', { status: 'ready' });
    await seedItem(paths, 'itm-b', { status: 'ready' });

    const outcome = await createDesign(paths, {
      designId: 'dsn-1',
      title: '',
      brief: { ...BRIEF, variationMode: 'per-reference', variantCount: 5 },
      referenceItemIds: ['itm-a', 'itm-b'],
      resolutions: [],
    });

    expect(outcome.status).toBe('created');
    const design = await readDesign(paths, 'dsn-1');
    expect(design?.variants.map((variant) => variant.referenceItemId)).toEqual(['itm-a', 'itm-b']);
  });

  it('leaves blend variants unbound to any single reference', async () => {
    await seedItem(paths, 'itm-a', { status: 'ready' });

    await createDesign(paths, {
      designId: 'dsn-1',
      title: '',
      brief: { ...BRIEF, variantCount: 2 },
      referenceItemIds: ['itm-a'],
      resolutions: [],
    });

    const design = await readDesign(paths, 'dsn-1');
    expect(design?.variants).toHaveLength(2);
    expect(design?.variants.every((variant) => variant.referenceItemId === undefined)).toBe(true);
  });

  it('titles an untitled Design from its request and projects it into the index', async () => {
    await seedItem(paths, 'itm-a', { status: 'ready' });

    await createDesign(paths, {
      designId: 'dsn-1',
      title: '   ',
      brief: BRIEF,
      referenceItemIds: ['itm-a'],
      resolutions: [],
    });

    const state = await readState(paths);
    expect(state.designs).toHaveLength(1);
    expect(state.designs[0]?.title).toBe('A dense operational dashboard');
    expect(state.designs[0]?.referenceItemIds).toEqual(['itm-a']);
  });

  it('refuses a request with no text', async () => {
    await seedItem(paths, 'itm-a', { status: 'ready' });

    const outcome = await createDesign(paths, {
      designId: 'dsn-1',
      title: '',
      brief: { ...BRIEF, request: '   ' },
      referenceItemIds: ['itm-a'],
      resolutions: [],
    });

    expect(outcome.status).toBe('refused');
  });
});

describe('variant lifecycle', () => {
  async function seedDesign(): Promise<string> {
    await seedItem(paths, 'itm-a', { status: 'ready' });
    const outcome = await createDesign(paths, {
      designId: 'dsn-1',
      title: 'Two variants',
      brief: { ...BRIEF, variantCount: 2 },
      referenceItemIds: ['itm-a'],
      resolutions: [],
    });
    if (outcome.status !== 'created') throw new Error('seed failed');
    return outcome.design.id;
  }

  it('cancels one variant and leaves its sibling alone', async () => {
    const designId = await seedDesign();
    const before = await readDesign(paths, designId);
    const [first, second] = before!.variants;

    await cancelVariant(paths, designId, first!.id);

    const after = await readDesign(paths, designId);
    expect(after?.variants.find((variant) => variant.id === first!.id)?.status).toBe('cancelled');
    expect(after?.variants.find((variant) => variant.id === second!.id)?.status).toBe('pending');
  });

  it('will not cancel a variant that already succeeded', async () => {
    const designId = await seedDesign();
    const design = await readDesign(paths, designId);
    const variantId = design!.variants[0]!.id;
    await mutateVariant(paths, designId, variantId, (variant) => ({ ...variant, status: 'ready' }));

    await cancelVariant(paths, designId, variantId);

    const after = await readDesign(paths, designId);
    expect(after?.variants.find((variant) => variant.id === variantId)?.status).toBe('ready');
  });

  it('retries only from a failed or cancelled variant, keeping its revisions', async () => {
    const designId = await seedDesign();
    const design = await readDesign(paths, designId);
    const variantId = design!.variants[0]!.id;
    await mutateVariant(paths, designId, variantId, (variant) => ({
      ...variant,
      status: 'failed',
      error: 'the model refused',
      revisions: [
        { id: 'rev-1', createdAt: 1, jobId: 'job-1', files: [{ name: 'index.html', bytes: 4 }], buildWarnings: [], summary: 'first try' },
      ],
    }));

    const jobId = await retryVariant(paths, designId, variantId);
    expect(jobId).not.toBeNull();

    const retried = await readDesign(paths, designId);
    const variant = retried?.variants.find((entry) => entry.id === variantId);
    expect(variant?.status).toBe('pending');
    expect(variant?.error).toBeUndefined();
    // The variant claims the new job, so an earlier run's late write is refused.
    expect(variant?.jobId).toBe(jobId);
    expect(variant?.revisions).toHaveLength(1);

    // A pending variant is already going to run; retrying it again is a no-op.
    expect(await retryVariant(paths, designId, variantId)).toBeNull();
  });

  it('removes a revision directory the record does not name', async () => {
    const designId = await seedDesign();
    const design = await readDesign(paths, designId);
    const variantId = design!.variants[0]!.id;
    await mutateVariant(paths, designId, variantId, (variant) => ({
      ...variant,
      revisions: [
        { id: 'rev-kept', createdAt: 1, jobId: 'job-1', files: [{ name: 'index.html', bytes: 4 }], buildWarnings: [], summary: '' },
      ],
    }));

    for (const revisionId of ['rev-kept', 'rev-orphan']) {
      const dir = revisionDir(paths, designId, variantId, revisionId);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'index.html'), '<p>hi</p>', 'utf8');
    }

    const withRevisions = await readDesign(paths, designId);
    expect(await pruneOrphanRevisions(paths, withRevisions!)).toBe(1);

    await expect(access(revisionDir(paths, designId, variantId, 'rev-kept'))).resolves.toBeUndefined();
    await expect(access(revisionDir(paths, designId, variantId, 'rev-orphan'))).rejects.toThrow();
  });
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
        },
        {
          id: 'rev-new',
          createdAt: 2,
          jobId: 'job-2',
          files: [{ name: 'index.html', bytes: 20 }],
          builtFile: 'preview.html',
          buildWarnings: [],
          summary: 'second',
        },
      ],
    }));

    const summary = (await readState(paths)).designs.find((entry) => entry.id === 'dsn-1');
    const variant = summary?.variants[0];
    // The pointer wins over recency: the visible revision is what renders.
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
    // The two guards are deliberate, but only this one holds when two
    // applicators reach the same id at once — and a test that goes through
    // `createDesign` passes with either of them alone, so it proves neither.
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

    // Neither writer finds a record when it starts, which is the case the
    // caller-side read cannot cover: both would pass that check and both would
    // then write.
    const [a, b] = await Promise.all([
      createDesignRecord(paths, { ...created.design, id: 'dsn-race', title: 'A' }),
      createDesignRecord(paths, { ...created.design, id: 'dsn-race', title: 'B' }),
    ]);

    // Exactly one creates, and both agree on what is stored.
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

    // Reporting "that reference is in Trash" would bury the fact that the
    // Design already exists and is perfectly fine.
    expect(replay.status).toBe('created');
  });
});
