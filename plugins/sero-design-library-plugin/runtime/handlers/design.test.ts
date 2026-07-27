/**
 * Guardrail conflicts and the revision replace/retain contract.
 */

import { describe, expect, it } from 'vitest';
import { designRecordPath } from '../../shared/paths';
import { readJsonFile } from '../../shared/state-io';
import type { DesignRecord, VariantRevisionRecord } from '../../shared/records';
import { attachRevision, createDesign, effectiveOverrides, findGuardrailConflicts, upsertVariant } from './design';
import { createFakeHost, type FakeHost } from '../__tests__/fakes';

function revision(id: string, variantId: string): VariantRevisionRecord {
  return {
    id,
    variantId,
    revisionNumber: 0,
    outputTarget: 'html',
    files: [{ path: 'body.html', contents: `<main>${id}</main>` }],
    assetIds: [],
    tweakManifest: { schemaVersion: 1, variantRevisionId: id, controls: [] },
    tweakOverrides: {},
    droppedTweakControls: [],
    createdAt: 1,
    createdReason: 'generated',
  };
}

describe('findGuardrailConflicts', () => {
  it('finds an Always that another reference states as a Never', () => {
    const conflicts = findGuardrailConflicts([
      { itemId: 'a', always: ['Use flat surfaces'], never: [] },
      { itemId: 'b', always: [], never: ['use flat surfaces'] },
    ]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ primaryItemId: 'a', conflictingItemId: 'b' });
  });

  it('treats a mere style difference as blendable, not blocking', () => {
    const conflicts = findGuardrailConflicts([
      { itemId: 'a', always: ['Keep geometry square'], never: [] },
      { itemId: 'b', always: ['Use generous rounding'], never: [] },
    ]);
    expect(conflicts).toEqual([]);
  });

  it('does not report a reference against itself or duplicate a pair', () => {
    const conflicts = findGuardrailConflicts([
      { itemId: 'a', always: ['x'], never: ['x'] },
      { itemId: 'b', always: [], never: ['x', 'X'] },
    ]);
    expect(conflicts).toHaveLength(1);
  });
});

describe('revision behaviour', () => {
  async function seed(): Promise<{ host: FakeHost; designId: string; variantId: string }> {
    const host = await createFakeHost();
    const designId = 'dsn-1';
    const variantId = 'var-1';

    await createDesign(host, {
      designId,
      title: 'Design',
      request: 'a page',
      outputTarget: 'html',
      itemIds: [],
    });
    await upsertVariant(host, designId, {
      id: variantId,
      title: 'Variant 1',
      status: 'queued',
      revisions: [],
    });
    await attachRevision(host, designId, variantId, revision('rev-1', variantId));

    return { host, designId, variantId };
  }

  it('replace moves the visible pointer and keeps the history', async () => {
    const { host, designId, variantId } = await seed();
    await attachRevision(host, designId, variantId, revision('rev-2', variantId), 'replace');

    const record = await readJsonFile<DesignRecord>(designRecordPath(host.paths, designId));
    expect(record?.variants[0].revisions.map((entry) => entry.id)).toEqual(['rev-1', 'rev-2']);
    expect(record?.variants[0].visibleRevisionId).toBe('rev-2');
  });

  it('retain keeps the previous result visible and still records the new one', async () => {
    const { host, designId, variantId } = await seed();
    await attachRevision(host, designId, variantId, revision('rev-2', variantId), 'retain');

    const record = await readJsonFile<DesignRecord>(designRecordPath(host.paths, designId));
    expect(record?.variants[0].revisions).toHaveLength(2);
    expect(record?.variants[0].visibleRevisionId).toBe('rev-1');
  });

  it('numbers revisions in order', async () => {
    const { host, designId, variantId } = await seed();
    await attachRevision(host, designId, variantId, revision('rev-2', variantId));

    const record = await readJsonFile<DesignRecord>(designRecordPath(host.paths, designId));
    expect(record?.variants[0].revisions.map((entry) => entry.revisionNumber)).toEqual([1, 2]);
  });
});

describe('effectiveOverrides', () => {
  it('lets unsaved working values win over the saved revision', () => {
    const saved = revision('rev-1', 'var-1');
    saved.tweakOverrides = { gap: 1, ink: '#111111' };

    expect(effectiveOverrides({
      id: 'var-1',
      title: 'Variant 1',
      status: 'succeeded',
      visibleRevisionId: 'rev-1',
      revisions: [saved],
      tweakWorking: {
        variantRevisionId: 'rev-1',
        overrides: { gap: 4 },
        updatedAt: 2,
        dirty: true,
      },
    })).toEqual({ gap: 4, ink: '#111111' });
  });

  it('returns nothing for a variant with no visible revision', () => {
    expect(effectiveOverrides({
      id: 'var-1',
      title: 'Variant 1',
      status: 'queued',
      revisions: [],
    })).toEqual({});
  });
});
