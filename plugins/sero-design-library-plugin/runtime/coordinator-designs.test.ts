import { describe, expect, it } from 'vitest';

import type { DesignBrief } from '../shared/design';
import { appendRequest, readStateWithIndexes } from '../shared/state-io';
import { useCoordinator } from './coordinator-harness';

const harness = useCoordinator('coordinator-designs');

const BRIEF: DesignBrief = {
  request: 'A dense operational dashboard',
  target: 'html',
  variationMode: 'blend',
  variantCount: 2,
  inspirationStrength: 'balanced',
};

describe('starting a Design', () => {
  it('creates it from analysed references and opens it', async () => {
    const itemId = await harness.importAndAnalyse('u1', 'shot.png', 'bytes');

    await appendRequest(harness.paths, {
      kind: 'design.create',
      designId: 'dsn-1',
      title: '',
      brief: BRIEF,
      referenceItemIds: [itemId],
      resolutions: [],
    sessionRules: [],
    });
    await harness.coordinator.drain();

    const state = await readStateWithIndexes(harness.paths);
    expect(state.designs.map((design) => design.id)).toEqual(['dsn-1']);
    expect(state.designs[0]?.variants).toHaveLength(2);
    expect(state.view.selectedDesignId).toBe('dsn-1');
    expect(state.view.activeVariantId).toBe(state.designs[0]?.variants[0]?.id);
  });

  it('reports a refusal and keeps draining', async () => {
    const failures: string[] = [];
    const strict = harness.withErrors(failures);

    // No such reference, so the Design could not say what it was made from.
    await appendRequest(harness.paths, {
      kind: 'design.create',
      designId: 'dsn-missing',
      title: '',
      brief: { ...BRIEF, variantCount: 1 },
      referenceItemIds: ['itm-nope'],
      resolutions: [],
    sessionRules: [],
    });
    await appendRequest(harness.paths, {
      kind: 'collection.create',
      collectionId: 'c-after',
      name: 'Still applied',
      colour: 'primary',
    });
    await strict.drain();
    await strict.dispose();

    expect(failures.some((message) => message.includes('design.create'))).toBe(true);
    const state = await readStateWithIndexes(harness.paths);
    expect(state.designs).toEqual([]);
    expect(state.collections.map((entry) => entry.name)).toEqual(['Still applied']);
  });

  it('takes a deleted Design off screen', async () => {
    const itemId = await harness.importAndAnalyse('u1', 'shot.png', 'bytes');
    await appendRequest(harness.paths, {
      kind: 'design.create',
      designId: 'dsn-1',
      title: 'Doomed',
      brief: { ...BRIEF, variantCount: 1 },
      referenceItemIds: [itemId],
      resolutions: [],
    sessionRules: [],
    });
    await harness.coordinator.drain();

    await appendRequest(harness.paths, { kind: 'design.delete', designId: 'dsn-1' });
    await harness.coordinator.drain();

    const state = await readStateWithIndexes(harness.paths);
    expect(state.designs[0]?.deletedAt).toBeDefined();
    expect(state.view.selectedDesignId).toBeUndefined();
  });
});
