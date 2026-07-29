import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { designLibraryPathsFromHome, revisionDir, type DesignLibraryPaths } from '../shared/paths';
import { readState } from '../shared/state-io';
import {
  mutateVariant,
  pruneOrphanRevisions,
  readDesign,
} from './design-store';
import {
  cancelVariant,
  createDesign,
  deleteRevision,
  retryVariant,
  startPendingVariants,
} from './designs';
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

  it('will not delete the revision a queued revise starts from', async () => {
    const designId = await seedDesign();
    const design = await readDesign(paths, designId);
    const variantId = design!.variants[0]!.id;
    await mutateVariant(paths, designId, variantId, (variant) => ({
      ...variant,
      status: 'ready',
      visibleRevisionId: 'rev-2',
      revisions: [
        { id: 'rev-1', createdAt: 1, jobId: 'job-1', files: [{ name: 'index.html', bytes: 4 }], buildWarnings: [], summary: 'first', name: '' },
        { id: 'rev-2', createdAt: 2, jobId: 'job-2', files: [{ name: 'index.html', bytes: 6 }], buildWarnings: [], summary: 'second', name: '' },
      ],
      pendingRevision: {
        instruction: 'Lighter surface',
        behaviour: 'replace',
        baseRevisionId: 'rev-2',
      },
    }));

    // A revise reads its base off disk when it runs. Deleting that revision
    // first would either fail the run or, once the record no longer names it,
    // drop the instruction and generate from the brief instead.
    await deleteRevision(paths, designId, variantId, 'rev-2');
    const guarded = await readDesign(paths, designId);
    expect(guarded?.variants[0]?.revisions.map((entry) => entry.id)).toEqual(['rev-1', 'rev-2']);

    // Another revision is still deletable while the revise waits.
    await deleteRevision(paths, designId, variantId, 'rev-1');
    const after = await readDesign(paths, designId);
    expect(after?.variants[0]?.revisions.map((entry) => entry.id)).toEqual(['rev-2']);
  });

  it('keeps the last revision, whichever one is asked for', async () => {
    const designId = await seedDesign();
    const design = await readDesign(paths, designId);
    const variantId = design!.variants[0]!.id;
    await mutateVariant(paths, designId, variantId, (variant) => ({
      ...variant,
      status: 'ready',
      visibleRevisionId: 'rev-1',
      revisions: [
        { id: 'rev-1', createdAt: 1, jobId: 'job-1', files: [{ name: 'index.html', bytes: 4 }], buildWarnings: [], summary: 'only', name: '' },
      ],
    }));

    // A variant marked ready with no revision has nothing to show and no way
    // back to having one except regenerating.
    await deleteRevision(paths, designId, variantId, 'rev-1');
    const after = await readDesign(paths, designId);
    expect(after?.variants[0]?.revisions).toHaveLength(1);
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
        { id: 'rev-1', createdAt: 1, jobId: 'job-1', files: [{ name: 'index.html', bytes: 4 }], buildWarnings: [], summary: 'first try', name: 'First cut' },
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

  it('declines a retry request it has already acted on', async () => {
    // The request log is applied at-least-once: a crash between applying a
    // request and recording that it was applied replays it. By then the retry
    // may have run and failed, which looks exactly like a variant asking to be
    // retried — and a second run costs another model call for work already done.
    const designId = await seedDesign();
    const design = await readDesign(paths, designId);
    const variantId = design!.variants[0]!.id;
    await mutateVariant(paths, designId, variantId, (variant) => ({
      ...variant,
      status: 'failed',
      error: 'the model refused',
    }));

    expect(await retryVariant(paths, designId, variantId, 7)).not.toBeNull();

    // The retry ran and failed again before the watermark moved.
    await mutateVariant(paths, designId, variantId, (variant) => ({
      ...variant,
      status: 'failed',
      error: 'and again',
    }));

    expect(await retryVariant(paths, designId, variantId, 7)).toBeNull();
    // A later request is a new ask, not a replay.
    expect(await retryVariant(paths, designId, variantId, 8)).not.toBeNull();
  });

  it('restarts a variant left running by a process that is gone', async () => {
    // Reconciliation repairs a variant whose job it can still read. Finished job
    // records are swept after a day, so a machine left closed longer than that
    // comes back to a variant nothing else would ever look at again.
    const designId = await seedDesign();
    const design = await readDesign(paths, designId);
    const variantId = design!.variants[0]!.id;
    await mutateVariant(paths, designId, variantId, (variant) => ({
      ...variant,
      status: 'running',
      jobId: 'job-that-was-swept',
    }));

    const started = await startPendingVariants(paths, designId);

    const after = await readDesign(paths, designId);
    const variant = after?.variants.find((entry) => entry.id === variantId);
    expect(variant?.status).toBe('pending');
    expect(started).toContain(variant?.jobId);
  });

  it('removes a revision directory the record does not name', async () => {
    const designId = await seedDesign();
    const design = await readDesign(paths, designId);
    const variantId = design!.variants[0]!.id;
    await mutateVariant(paths, designId, variantId, (variant) => ({
      ...variant,
      revisions: [
        { id: 'rev-kept', createdAt: 1, jobId: 'job-1', files: [{ name: 'index.html', bytes: 4 }], buildWarnings: [], summary: '', name: '' },
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
