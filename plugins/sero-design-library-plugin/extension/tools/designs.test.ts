import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';

import {
  designLibraryPathsFromHome,
  revisionDir,
  type DesignLibraryPaths,
} from '../../shared/paths';
import { readState } from '../../shared/state-io';
import { createDesign } from '../../runtime/designs';
import { mutateVariant } from '../../runtime/design-store';
import { seedItem } from '../../runtime/test-fixtures';
import { registerDesignTool } from './designs';

/**
 * The design tool is the only surface that can tell a caller *why* a Design was
 * refused, so the refusals are tested here rather than only in the runtime.
 */

let home: string;
let paths: DesignLibraryPaths;
let tools: Map<string, ToolDefinition>;

function collectTools(): ExtensionAPI {
  tools = new Map();
  return {
    registerTool(definition: ToolDefinition) {
      tools.set(definition.name, definition);
    },
  } as unknown as ExtensionAPI;
}

async function call(params: Record<string, unknown>) {
  const tool = tools.get('design_library_designs');
  if (!tool) throw new Error('design_library_designs was never registered');
  return tool.execute('test-call', params, new AbortController().signal, () => undefined, undefined as never);
}

function textOf(result: { content: Array<{ type: string }> }): string {
  const block = result.content.find((entry) => entry.type === 'text');
  return block && 'text' in block ? String(block.text) : '';
}

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-design-tool-'));
  paths = designLibraryPathsFromHome(path.join(home, 'apps', 'design-library'));
  registerDesignTool(collectTools(), paths);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

const CREATE = { action: 'create', request: 'A dense operational dashboard', target: 'html' };

describe('refusing to start a Design', () => {
  it('rejects a traversal in a reference id without queuing anything', async () => {
    const result = await call({ ...CREATE, referenceItemIds: ['../../..'] });

    expect(textOf(result)).toContain('not a valid item id');
    expect((await readState(paths)).requests).toEqual([]);
  });

  it('rejects a traversal in a design id', async () => {
    for (const action of ['get', 'open', 'delete', 'restore']) {
      const result = await call({ action, designId: '../../..' });
      expect(textOf(result), action).toContain('not a valid design id');
    }
  });

  it('rejects a variant id that is not a safe identifier', async () => {
    const result = await call({
      action: 'retry-variant',
      designId: 'dsn-1',
      variantId: '../escape',
    });
    expect(textOf(result)).toContain('not a valid variant id');
  });

  it('names the references that have no analysis', async () => {
    await seedItem(paths, 'itm-ready', { status: 'ready' });
    await seedItem(paths, 'itm-waiting', { status: 'pending' });

    const result = await call({ ...CREATE, referenceItemIds: ['itm-ready', 'itm-waiting'] });

    expect(textOf(result)).toContain('itm-waiting');
    expect((await readState(paths)).requests).toEqual([]);
  });

  it('names a reference that does not exist', async () => {
    const result = await call({ ...CREATE, referenceItemIds: ['itm-nope'] });
    expect(textOf(result)).toContain('No Library item itm-nope');
  });

  it('will not take more references than a Design allows', async () => {
    const ids = Array.from({ length: 7 }, (_, index) => `itm-${index}`);
    for (const id of ids) await seedItem(paths, id, { status: 'ready' });

    const result = await call({ ...CREATE, referenceItemIds: ids });

    expect(textOf(result)).toContain('at most 6 references');
  });

  it('needs a request', async () => {
    await seedItem(paths, 'itm-a', { status: 'ready' });
    const result = await call({ action: 'create', request: '  ', referenceItemIds: ['itm-a'] });
    expect(textOf(result)).toContain('needs a request');
  });

  it('holds a Design back until each guardrail conflict is resolved', async () => {
    await seedItem(paths, 'itm-a', { status: 'ready', always: ['Use generous whitespace'] });
    await seedItem(paths, 'itm-b', { status: 'ready', never: ['Use generous whitespace'] });

    const blocked = await call({ ...CREATE, referenceItemIds: ['itm-a', 'itm-b'] });
    expect(textOf(blocked)).toContain('Resolve these guardrail conflicts first');
    expect((await readState(paths)).requests).toEqual([]);

    const allowed = await call({
      ...CREATE,
      referenceItemIds: ['itm-a', 'itm-b'],
      resolutions: [{ rule: 'Use generous whitespace', keep: 'never' }],
    });
    expect(textOf(allowed)).toContain('Queued');
  });
});

describe('opening Design files', () => {
  it('returns only the folder for a revision that belongs to the Design', async () => {
    await seedItem(paths, 'itm-ready', { status: 'ready' });
    const outcome = await createDesign(paths, {
      designId: 'dsn-1',
      title: 'Files',
      brief: {
        request: 'A page',
        target: 'html',
        variationMode: 'blend',
        variantCount: 1,
        inspirationStrength: 'balanced',
      },
      referenceItemIds: ['itm-ready'],
      resolutions: [],
    });
    if (outcome.status !== 'created') throw new Error('Design was refused');
    const variantId = outcome.design.variants[0]!.id;
    await mutateVariant(paths, 'dsn-1', variantId, (variant) => ({
      ...variant,
      revisions: [
        {
          id: 'rev-1',
          jobId: 'job-1',
          createdAt: 1,
          files: [{ name: 'index.html', bytes: 20 }],
          buildWarnings: [],
          summary: '',
          name: '',
        },
      ],
    }));

    const result = await call({
      action: 'files-location',
      designId: 'dsn-1',
      variantId,
      revisionId: 'rev-1',
    });

    expect((result.details as { folder?: string }).folder).toBe(
      revisionDir(paths, 'dsn-1', variantId, 'rev-1'),
    );
  });

  it('does not return a path for a revision that is not on the record', async () => {
    const result = await call({
      action: 'files-location',
      designId: 'dsn-missing',
      variantId: 'var-missing',
      revisionId: 'rev-missing',
    });

    expect((result.details as { ok?: boolean }).ok).toBe(false);
    expect((result.details as { folder?: string }).folder).toBeUndefined();
  });
});

describe('reading the synthesis before creating', () => {
  it('reports the conflict a create would be blocked on', async () => {
    await seedItem(paths, 'itm-a', { status: 'ready', always: ['Keep geometry square'] });
    await seedItem(paths, 'itm-b', { status: 'ready', never: ['keep geometry square.'] });

    const result = await call({
      action: 'synthesis',
      referenceItemIds: ['itm-a', 'itm-b'],
    });

    expect(textOf(result)).toContain('Blocking conflicts');
    expect(textOf(result)).toContain('Keep geometry square');
  });

  it('reports no conflict for compatible references', async () => {
    await seedItem(paths, 'itm-a', { status: 'ready', always: ['Keep geometry square'] });
    await seedItem(paths, 'itm-b', { status: 'ready', never: ['Decorative gradients'] });

    const result = await call({ action: 'synthesis', referenceItemIds: ['itm-a', 'itm-b'] });

    expect(textOf(result)).toContain('No blocking conflicts');
  });
});

describe('queuing work on a Design', () => {
  it('plans one variant per reference in per-reference mode', async () => {
    await seedItem(paths, 'itm-a', { status: 'ready' });
    await seedItem(paths, 'itm-b', { status: 'ready' });

    const result = await call({
      ...CREATE,
      referenceItemIds: ['itm-a', 'itm-b'],
      variationMode: 'per-reference',
      variantCount: 5,
    });

    expect((result.details as { variantCount?: number }).variantCount).toBe(2);
    const [request] = (await readState(paths)).requests;
    expect(request?.body).toMatchObject({ kind: 'design.create' });
  });

  it('keeps reference order as given, since the first one leads', async () => {
    await seedItem(paths, 'itm-a', { status: 'ready' });
    await seedItem(paths, 'itm-b', { status: 'ready' });

    await call({ ...CREATE, referenceItemIds: ['itm-b', 'itm-a'] });

    const [request] = (await readState(paths)).requests;
    expect(request?.body).toMatchObject({ referenceItemIds: ['itm-b', 'itm-a'] });
  });

  it('starts a Remix in a new family with the saved version as lineage', async () => {
    await seedItem(paths, 'itm-a', { status: 'ready' });

    await call({
      ...CREATE,
      referenceItemIds: ['itm-a'],
      galleryParentFamilyId: 'fam-1',
      galleryParentVersionId: 'ver-1',
    });

    const [request] = (await readState(paths)).requests;
    expect(request?.body).toMatchObject({
      kind: 'design.create',
      galleryLineage: {
        mode: 'remix', parentFamilyId: 'fam-1', parentVersionId: 'ver-1',
      },
    });
    expect(request?.body).toHaveProperty('galleryFamilyId');
  });

  it('queues a revise carrying the instruction and what to do with the old result', async () => {
    const result = await call({
      action: 'revise-variant',
      designId: 'dsn-1',
      variantId: 'var-1',
      instruction: '  Make the metrics tighter  ',
      behaviour: 'retain',
    });

    expect(textOf(result)).toContain('joins this variant');
    const [request] = (await readState(paths)).requests;
    expect(request?.body).toEqual({
      kind: 'design.revise-variant',
      designId: 'dsn-1',
      variantId: 'var-1',
      instruction: 'Make the metrics tighter',
      behaviour: 'retain',
    });
  });

  it('refuses a revise with nothing to change, and falls back to the saved default', async () => {
    const empty = await call({
      action: 'revise-variant',
      designId: 'dsn-1',
      variantId: 'var-1',
      instruction: '   ',
    });
    expect(textOf(empty)).toContain('needs an instruction');
    expect((await readState(paths)).requests).toEqual([]);

    await call({
      action: 'revise-variant',
      designId: 'dsn-1',
      variantId: 'var-1',
      instruction: 'Make it denser',
    });
    // The default is the generation setting, so an agent that does not care gets
    // the behaviour the user last chose rather than one this tool invented.
    expect((await readState(paths)).requests[0]?.body).toMatchObject({ behaviour: 'replace' });
  });

  it('rejects an unsafe revision id before queuing a tweak', async () => {
    for (const action of ['set-tweak', 'show-revision', 'delete-revision']) {
      const result = await call({
        action,
        designId: 'dsn-1',
        variantId: 'var-1',
        revisionId: '../escape',
        controlId: 'gap',
        value: '12',
      });
      expect(textOf(result), action).toContain('not a valid revision id');
    }
    expect((await readState(paths)).requests).toEqual([]);
  });

  it('queues a tweak against the revision it belongs to', async () => {
    await call({
      action: 'set-tweak',
      designId: 'dsn-1',
      variantId: 'var-1',
      revisionId: 'rev-1',
      controlId: 'gap',
      value: '20',
    });

    const [request] = (await readState(paths)).requests;
    expect(request?.body).toEqual({
      kind: 'design.set-tweak',
      designId: 'dsn-1',
      variantId: 'var-1',
      revisionId: 'rev-1',
      controlId: 'gap',
      value: '20',
    });
  });

  it('queues a retry that names one variant only', async () => {
    await call({ action: 'retry-variant', designId: 'dsn-1', variantId: 'var-1' });

    const [request] = (await readState(paths)).requests;
    expect(request?.body).toEqual({
      kind: 'design.retry-variant',
      designId: 'dsn-1',
      variantId: 'var-1',
    });
  });
});
