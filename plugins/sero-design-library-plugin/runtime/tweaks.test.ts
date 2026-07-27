import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { AppRuntimeSubagentRunParams } from '@sero-ai/common';

import type { DesignBrief, DesignRevision } from '../shared/design';
import { revisionDir } from '../shared/paths';
import { appendRequest } from '../shared/state-io';
import { TWEAK_MANIFEST_FILE, normalizeTweakDocument } from '../shared/tweaks';
import {
  STUB_TWEAKABLE_PAGE,
  declareTweaks,
  isGenerationRun,
  nameDesign,
  stubAnalysisRun,
  useCoordinator,
  writeDesignFiles,
} from './coordinator-harness';
import { readDesign } from './design-store';
import { restoreTweakCheckpoint } from './tweaks';

/**
 * Tweak state end to end (spec §6.5, §6.7): a run declares controls over the page
 * it wrote, the manifest lands beside the revision, and values set through the
 * request log survive as overrides on that revision.
 *
 * The behaviours that matter here are the ones a slider makes easy to get wrong —
 * a value the manifest does not accept must not be stored, and forty changes must
 * leave one entry in history rather than forty.
 */

const harness = useCoordinator('tweaks');

const BRIEF: DesignBrief = {
  request: 'A dense operational dashboard',
  target: 'html',
  variationMode: 'blend',
  variantCount: 1,
  inspirationStrength: 'balanced',
};

const CONTROLS = [
  {
    id: 'signal',
    group: 'Colour',
    label: 'Signal accent',
    cssVariable: '--signal',
    type: 'colour',
    defaultValue: '#16805f',
  },
  {
    id: 'gap',
    group: 'Density',
    label: 'Grid gap',
    cssVariable: '--gap',
    type: 'range',
    defaultValue: '12',
    min: 4,
    max: 32,
    step: 2,
    unit: 'px',
  },
];

/** A model that writes an adjustable page and declares controls over it. */
function stubTweakingModel(controls: Array<Record<string, unknown>> = CONTROLS): void {
  harness.runStructured.mockImplementation(async (params: AppRuntimeSubagentRunParams) => {
    if (!isGenerationRun(params)) return stubAnalysisRun(params);
    await writeDesignFiles(params, [{ name: 'index.html', content: STUB_TWEAKABLE_PAGE }]);
    await nameDesign(params, { name: 'Signal ledger', summary: 'Typography-led panel.' });
    await declareTweaks(params, controls);
    return { response: 'done', modelId: 'stub-model', providerId: 'stub' };
  });
}

async function createDesign(): Promise<{ designId: string; variantId: string; revision: DesignRevision }> {
  const itemId = await harness.importAndAnalyse('u1', 'shot.png', 'bytes');
  await appendRequest(harness.paths, {
    kind: 'design.create',
    designId: 'dsn-1',
    title: 'Agent operations',
    brief: BRIEF,
    referenceItemIds: [itemId],
    resolutions: [],
    sessionRules: [],
  });
  await harness.coordinator.drain();

  await vi.waitFor(async () => {
    const design = await readDesign(harness.paths, 'dsn-1');
    expect(design?.variants[0]?.status).toBe('ready');
  }, { timeout: 5_000 });

  const design = (await readDesign(harness.paths, 'dsn-1'))!;
  const variant = design.variants[0]!;
  return { designId: design.id, variantId: variant.id, revision: variant.revisions.at(-1)! };
}

/** The tweak state on the revision, as stored. */
async function tweaksOf(variantId: string, revisionId: string) {
  const design = await readDesign(harness.paths, 'dsn-1');
  const variant = design?.variants.find((entry) => entry.id === variantId);
  return variant?.revisions.find((entry) => entry.id === revisionId)?.tweaks;
}

describe('a manifest authored with the revision', () => {
  it('is written beside the revision and bound to it', async () => {
    stubTweakingModel();
    const { designId, variantId, revision } = await createDesign();

    expect(revision.tweakManifestFile).toBe(TWEAK_MANIFEST_FILE);
    const file = path.join(
      revisionDir(harness.paths, designId, variantId, revision.id),
      TWEAK_MANIFEST_FILE,
    );
    const { manifest, dropped } = normalizeTweakDocument(JSON.parse(await readFile(file, 'utf8')));

    // Bound to the revision it describes, not to the variant: a retry produces a
    // different page, and a manifest that outlived its code would describe none.
    expect(manifest.variantRevisionId).toBe(revision.id);
    expect(manifest.controls.map((control) => control.id)).toEqual(['signal', 'gap']);
    expect(dropped).toEqual([]);
  });

  it('lets the built document accept exactly the properties it declared', async () => {
    stubTweakingModel();
    const { designId, variantId, revision } = await createDesign();

    const document = await readFile(
      path.join(revisionDir(harness.paths, designId, variantId, revision.id), revision.builtFile!),
      'utf8',
    );

    expect(document).toContain('var ALLOWED = ["--signal","--gap"]');
  });

  it('records what validation dropped, and still renders the page', async () => {
    stubTweakingModel([
      ...CONTROLS,
      {
        id: 'ghost',
        group: 'Colour',
        label: 'Paper tone',
        cssVariable: '--paper',
        type: 'colour',
        defaultValue: '#ffffff',
      },
    ]);
    const { designId, variantId, revision } = await createDesign();

    const { manifest, dropped } = normalizeTweakDocument(
      JSON.parse(
        await readFile(
          path.join(revisionDir(harness.paths, designId, variantId, revision.id), TWEAK_MANIFEST_FILE),
          'utf8',
        ),
      ),
    );

    expect(manifest.controls).toHaveLength(2);
    expect(dropped.map((entry) => entry.label)).toEqual(['Paper tone']);
    // A dropped control is a note about a page that works, never a reason to
    // fail the variant that produced it.
    expect(revision.builtFile).toBeDefined();
  });

  it('leaves no manifest at all when the run declared nothing', async () => {
    harness.runStructured.mockImplementation(async (params: AppRuntimeSubagentRunParams) => {
      if (!isGenerationRun(params)) return stubAnalysisRun(params);
      await writeDesignFiles(params, [{ name: 'index.html', content: STUB_TWEAKABLE_PAGE }]);
      await nameDesign(params, { name: 'Signal ledger', summary: 'Typography-led panel.' });
      return { response: 'done', modelId: 'stub-model', providerId: 'stub' };
    });
    const { revision } = await createDesign();

    expect(revision.tweakManifestFile).toBeUndefined();
    expect(revision.builtFile).toBeDefined();
  });
});

describe('tweak values', () => {
  it('stores a value the manifest accepts, against the revision it belongs to', async () => {
    stubTweakingModel();
    const { designId, variantId, revision } = await createDesign();

    await appendRequest(harness.paths, {
      kind: 'design.set-tweak',
      designId,
      variantId,
      revisionId: revision.id,
      controlId: 'gap',
      value: '20',
    });
    await harness.coordinator.drain();

    expect((await tweaksOf(variantId, revision.id))?.overrides).toEqual({ gap: 20 });
  });

  it('refuses a value the control does not define, and one for a control it never declared', async () => {
    stubTweakingModel();
    const { designId, variantId, revision } = await createDesign();

    for (const body of [
      { controlId: 'signal', value: 'red; behavior: url(evil)' },
      { controlId: 'not-a-control', value: '4' },
    ]) {
      await appendRequest(harness.paths, {
        kind: 'design.set-tweak',
        designId,
        variantId,
        revisionId: revision.id,
        ...body,
      });
    }
    await harness.coordinator.drain();

    // The UI checks too, but requests arrive through a file: the runtime is
    // where a value that no control accepts has to stop.
    expect(await tweaksOf(variantId, revision.id)).toBeUndefined();
  });

  it('clamps a value to the range the manifest declared', async () => {
    stubTweakingModel();
    const { designId, variantId, revision } = await createDesign();

    await appendRequest(harness.paths, {
      kind: 'design.set-tweak',
      designId,
      variantId,
      revisionId: revision.id,
      controlId: 'gap',
      value: '400',
    });
    await harness.coordinator.drain();

    expect((await tweaksOf(variantId, revision.id))?.overrides).toEqual({ gap: 32 });
  });

  it('resets one control and leaves the rest alone', async () => {
    stubTweakingModel();
    const { designId, variantId, revision } = await createDesign();
    const target = { designId, variantId, revisionId: revision.id };

    await appendRequest(harness.paths, { kind: 'design.set-tweak', ...target, controlId: 'gap', value: '20' });
    await appendRequest(harness.paths, {
      kind: 'design.set-tweak',
      ...target,
      controlId: 'signal',
      value: '#2f6fb5',
    });
    await appendRequest(harness.paths, { kind: 'design.reset-tweak', ...target, controlId: 'gap' });
    await harness.coordinator.drain();

    expect((await tweaksOf(variantId, revision.id))?.overrides).toEqual({ signal: '#2f6fb5' });
  });
});

describe('editing sessions', () => {
  it('checkpoints a session once, however many changes it held', async () => {
    stubTweakingModel();
    const { designId, variantId, revision } = await createDesign();
    const target = { designId, variantId, revisionId: revision.id };

    // A drag is dozens of writes. One checkpoint is what the panel closing means.
    for (const value of ['6', '8', '10', '12', '14']) {
      await appendRequest(harness.paths, { kind: 'design.set-tweak', ...target, controlId: 'gap', value });
    }
    await appendRequest(harness.paths, { kind: 'design.checkpoint-tweaks', ...target });
    await harness.coordinator.drain();

    const state = await tweaksOf(variantId, revision.id);
    expect(state?.overrides).toEqual({ gap: 14 });
    expect(state?.checkpoints).toHaveLength(1);
    expect(state?.checkpoints[0]?.overrides).toEqual({ gap: 14 });
  });

  it('does not checkpoint a session in which nothing changed', async () => {
    stubTweakingModel();
    const { designId, variantId, revision } = await createDesign();
    const target = { designId, variantId, revisionId: revision.id };

    await appendRequest(harness.paths, { kind: 'design.set-tweak', ...target, controlId: 'gap', value: '20' });
    for (const _ of [0, 1, 2]) {
      await appendRequest(harness.paths, { kind: 'design.checkpoint-tweaks', ...target });
    }
    await harness.coordinator.drain();

    // Every tab switch ends a session. Only the first of these had anything new
    // in it, and the rest would otherwise fill the history with nothing.
    expect((await tweaksOf(variantId, revision.id))?.checkpoints).toHaveLength(1);
  });

  it('makes Reset all recoverable', async () => {
    stubTweakingModel();
    const { designId, variantId, revision } = await createDesign();
    const target = { designId, variantId, revisionId: revision.id };

    await appendRequest(harness.paths, { kind: 'design.set-tweak', ...target, controlId: 'gap', value: '20' });
    await appendRequest(harness.paths, { kind: 'design.reset-tweaks', ...target });
    await harness.coordinator.drain();

    const reset = await tweaksOf(variantId, revision.id);
    expect(reset?.overrides).toEqual({});
    expect(reset?.checkpoints).toHaveLength(1);

    await appendRequest(harness.paths, {
      kind: 'design.restore-tweaks',
      ...target,
      checkpointId: reset!.checkpoints[0]!.id,
    });
    await harness.coordinator.drain();

    expect((await tweaksOf(variantId, revision.id))?.overrides).toEqual({ gap: 20 });
  });

  it('applies a restore once, however many times the request is replayed', async () => {
    // Requests are applied at-least-once: a crash between applying one and
    // recording that it was applied replays it. A restore that appended a fresh
    // checkpoint every time would turn one undo into a history that grows on its
    // own, and eventually pushes the entry being restored off the end.
    stubTweakingModel();
    const { designId, variantId, revision } = await createDesign();
    const target = { designId, variantId, revisionId: revision.id };

    await appendRequest(harness.paths, { kind: 'design.set-tweak', ...target, controlId: 'gap', value: '20' });
    await appendRequest(harness.paths, { kind: 'design.checkpoint-tweaks', ...target });
    await appendRequest(harness.paths, { kind: 'design.set-tweak', ...target, controlId: 'gap', value: '8' });
    await harness.coordinator.drain();

    const checkpointId = (await tweaksOf(variantId, revision.id))!.checkpoints[0]!.id;

    // Applied twice under the same request id, which is exactly what a crash
    // between applying a request and recording it produces.
    await restoreTweakCheckpoint(harness.paths, target, checkpointId, 42);
    const once = await tweaksOf(variantId, revision.id);
    await restoreTweakCheckpoint(harness.paths, target, checkpointId, 42);
    const twice = await tweaksOf(variantId, revision.id);

    expect(once?.overrides).toEqual({ gap: 20 });
    expect(twice?.overrides).toEqual({ gap: 20 });
    expect(twice?.checkpoints).toHaveLength(once!.checkpoints.length);
    // The displaced values are kept once, so the undo is still there to take.
    expect(twice?.checkpoints.at(-1)?.overrides).toEqual({ gap: 8 });
  });

  it('applies a restore once even when the values already match the newest entry', async () => {
    // The case a value-based replay check gets wrong: the first application
    // writes no marker because the values it displaced were already the newest
    // checkpoint, so the replay sees a history it can add to again.
    stubTweakingModel();
    const { designId, variantId, revision } = await createDesign();
    const target = { designId, variantId, revisionId: revision.id };

    await appendRequest(harness.paths, { kind: 'design.set-tweak', ...target, controlId: 'gap', value: '20' });
    await appendRequest(harness.paths, { kind: 'design.checkpoint-tweaks', ...target });
    await harness.coordinator.drain();

    const first = (await tweaksOf(variantId, revision.id))!;
    expect(first.checkpoints).toHaveLength(1);
    expect(first.overrides).toEqual({ gap: 20 });

    // Values equal the newest checkpoint; restoring a different one displaces
    // exactly those values.
    await appendRequest(harness.paths, { kind: 'design.set-tweak', ...target, controlId: 'gap', value: '8' });
    await appendRequest(harness.paths, { kind: 'design.checkpoint-tweaks', ...target });
    await harness.coordinator.drain();

    const checkpointId = (await tweaksOf(variantId, revision.id))!.checkpoints[0]!.id;
    await restoreTweakCheckpoint(harness.paths, target, checkpointId, 7);
    const once = await tweaksOf(variantId, revision.id);
    await restoreTweakCheckpoint(harness.paths, target, checkpointId, 7);
    const twice = await tweaksOf(variantId, revision.id);

    expect(once?.overrides).toEqual({ gap: 20 });
    expect(twice?.overrides).toEqual({ gap: 20 });
    expect(twice?.checkpoints).toHaveLength(once!.checkpoints.length);
  });

  it('survives a restart, because the values live on the record', async () => {
    stubTweakingModel();
    const { designId, variantId, revision } = await createDesign();

    await appendRequest(harness.paths, {
      kind: 'design.set-tweak',
      designId,
      variantId,
      revisionId: revision.id,
      controlId: 'gap',
      value: '20',
    });
    await harness.coordinator.drain();
    await harness.coordinator.dispose();

    const restarted = harness.withErrors([]);
    await restarted.start();
    expect((await tweaksOf(variantId, revision.id))?.overrides).toEqual({ gap: 20 });
    await restarted.dispose();
  });
});
