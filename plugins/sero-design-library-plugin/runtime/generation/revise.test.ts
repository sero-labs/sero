import { describe, expect, it, vi } from 'vitest';

import type { AppRuntimeSubagentRunParams } from '@sero-ai/common';

import type { DesignBrief, DesignRecord } from '../../shared/design';
import { appendRequest } from '../../shared/state-io';
import {
  STUB_PAGE,
  isGenerationRun,
  nameDesign,
  stubAnalysisRun,
  useCoordinator,
  writeDesignFiles,
} from '../coordinator-harness';
import { readDesign } from '../design-store';

/**
 * Revising a variant (spec §6.4).
 *
 * The behaviours that matter: the run is given the page it is editing rather
 * than the brief alone, a revise that changed nothing is refused, and replacing
 * a result never destroys it.
 */

const harness = useCoordinator('revise');

const BRIEF: DesignBrief = {
  request: 'A dense operational dashboard',
  target: 'html',
  variationMode: 'blend',
  variantCount: 1,
  inspirationStrength: 'balanced',
};

const REVISED_PAGE = '<body><main id="generated">Revised page</main></body>';

async function createDesign(): Promise<DesignRecord> {
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
  return settled();
}

async function settled(): Promise<DesignRecord> {
  await vi.waitFor(async () => {
    const design = await readDesign(harness.paths, 'dsn-1');
    expect(
      design?.variants.every(
        (variant) => variant.status !== 'pending' && variant.status !== 'running',
      ),
    ).toBe(true);
  }, { timeout: 5_000 });
  return (await readDesign(harness.paths, 'dsn-1'))!;
}

async function revise(
  variantId: string,
  instruction: string,
  behaviour: 'replace' | 'retain',
): Promise<DesignRecord> {
  await appendRequest(harness.paths, {
    kind: 'design.revise-variant',
    designId: 'dsn-1',
    variantId,
    instruction,
    behaviour,
  });
  await harness.coordinator.drain();
  return settled();
}

/** A model that rewrites the entry file, as a revise is meant to. */
function stubRevisingModel(page = REVISED_PAGE): void {
  harness.runStructured.mockImplementation(async (params: AppRuntimeSubagentRunParams) => {
    if (!isGenerationRun(params)) return stubAnalysisRun(params);
    const revising = params.task.includes('Revise this design');
    await writeDesignFiles(params, [
      { name: 'index.html', content: revising ? page : STUB_PAGE },
    ]);
    await nameDesign(params, {
      name: revising ? 'Signal ledger II' : 'Signal ledger',
      summary: revising ? 'Tighter metrics.' : 'Typography-led panel.',
    });
    return { response: 'done', modelId: 'stub-model', providerId: 'stub' };
  });
}

describe('revising a variant', () => {
  it('gives the run the page it is editing, not just the brief', async () => {
    stubRevisingModel();
    const design = await createDesign();
    await revise(design.variants[0]!.id, 'Make the metrics tighter', 'replace');

    const task = harness.runStructured.mock.calls
      .map((call) => call[0] as AppRuntimeSubagentRunParams)
      .filter(isGenerationRun)
      .at(-1)?.task;

    // Without the current files the model rewrites the page from the brief, and
    // everything the instruction did not mention comes back subtly different.
    expect(task).toContain('Make the metrics tighter');
    expect(task).toContain('Generated page');
    expect(task).toContain('Change what is asked and nothing else');
  });

  it('replaces the visible result, and keeps it recoverable', async () => {
    stubRevisingModel();
    const created = await createDesign();
    const variantId = created.variants[0]!.id;
    const original = created.variants[0]!.revisions[0]!;

    const design = await revise(variantId, 'Make the metrics tighter', 'replace');
    const variant = design.variants[0]!;

    expect(variant.revisions).toHaveLength(2);
    expect(variant.visibleRevisionId).not.toBe(original.id);
    // Replaced, not destroyed: the revision keeps its files and its place, and
    // the History tab can put it back on screen.
    const superseded = variant.revisions.find((entry) => entry.id === original.id);
    expect(superseded?.supersededAt).toBeGreaterThan(0);
    expect(superseded?.builtFile).toBeDefined();
  });

  it('keeps both when asked to retain', async () => {
    stubRevisingModel();
    const created = await createDesign();
    const original = created.variants[0]!.revisions[0]!;

    const design = await revise(created.variants[0]!.id, 'Try a lighter surface', 'retain');
    const variant = design.variants[0]!;

    expect(variant.revisions).toHaveLength(2);
    expect(variant.revisions.find((entry) => entry.id === original.id)?.supersededAt).toBeUndefined();
    expect(variant.visibleRevisionId).toBe(variant.revisions[1]?.id);
  });

  it('refuses a revise that changed nothing', async () => {
    // The failure that would otherwise be invisible: a model that agrees with
    // itself, writes no file, and leaves a second identical revision behind —
    // having retired the original in favour of a copy of itself.
    harness.runStructured.mockImplementation(async (params: AppRuntimeSubagentRunParams) => {
      if (!isGenerationRun(params)) return stubAnalysisRun(params);
      if (params.task.includes('Revise this design')) {
        return { response: 'The page already does that.' };
      }
      await writeDesignFiles(params, [{ name: 'index.html', content: STUB_PAGE }]);
      await nameDesign(params, { name: 'Signal ledger', summary: 'Typography-led panel.' });
      return { response: 'done', modelId: 'stub-model', providerId: 'stub' };
    });

    const created = await createDesign();
    const original = created.variants[0]!.revisions[0]!;
    const design = await revise(created.variants[0]!.id, 'Make it denser', 'replace');
    const variant = design.variants[0]!;

    expect(variant.status).toBe('failed');
    expect(variant.error).toContain('not changed anything');
    expect(variant.revisions).toHaveLength(1);
    expect(variant.revisions[0]?.supersededAt).toBeUndefined();
    expect(variant.visibleRevisionId).toBe(original.id);
  });

  it('keeps the instruction after a failure, so a retry repeats the change', async () => {
    stubRevisingModel();
    const created = await createDesign();
    const variantId = created.variants[0]!.id;

    harness.runStructured.mockImplementation(async (params: AppRuntimeSubagentRunParams) => {
      if (!isGenerationRun(params)) return stubAnalysisRun(params);
      return { response: 'nothing written' };
    });
    const failed = await revise(variantId, 'Make the metrics tighter', 'replace');

    expect(failed.variants[0]?.status).toBe('failed');
    // Otherwise Retry would quietly regenerate the page from the original brief
    // instead of carrying out the change that was asked for.
    expect(failed.variants[0]?.pendingRevision?.instruction).toBe('Make the metrics tighter');

    stubRevisingModel();
    await appendRequest(harness.paths, {
      kind: 'design.retry-variant',
      designId: 'dsn-1',
      variantId,
    });
    await harness.coordinator.drain();
    const repaired = await settled();

    expect(repaired.variants[0]?.status).toBe('ready');
    expect(repaired.variants[0]?.pendingRevision).toBeUndefined();
    expect(repaired.variants[0]?.revisions).toHaveLength(2);
  });

  it('keeps the instruction when Sero shuts down mid-revise', async () => {
    // Shutting down is not cancelling. If the instruction went with the abort,
    // restart recovery would resume the job as an ordinary generation and the
    // variant would quietly rebuild itself from the original brief — the one
    // outcome a revise must never have.
    stubRevisingModel();
    const created = await createDesign();
    const variantId = created.variants[0]!.id;
    const baseRevisionId = created.variants[0]!.revisions[0]!.id;

    let disposed: Promise<void> | null = null;
    harness.runStructured.mockImplementation(async (params: AppRuntimeSubagentRunParams) => {
      if (!isGenerationRun(params)) return stubAnalysisRun(params);
      // Dispose while the run is in flight, which is what quitting does.
      disposed = harness.coordinator.dispose();
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { response: 'Aborted by shutdown', error: 'Aborted' };
    });

    await appendRequest(harness.paths, {
      kind: 'design.revise-variant',
      designId: 'dsn-1',
      variantId,
      instruction: 'Make the metrics tighter',
      behaviour: 'replace',
    });
    await harness.coordinator.drain();
    await disposed;

    const design = (await readDesign(harness.paths, 'dsn-1'))!;
    const variant = design.variants[0]!;
    expect(variant.pendingRevision).toEqual({
      instruction: 'Make the metrics tighter',
      behaviour: 'replace',
      baseRevisionId,
    });
    // And the variant is left where reconciliation will pick it up again.
    expect(variant.status).not.toBe('cancelled');

    // Restarting resumes it *as the revise it was*: the model is given the
    // instruction and the page it was editing, not the original brief alone.
    const restarted = harness.withErrors([]);
    const tasks: string[] = [];
    harness.runStructured.mockImplementation(async (params: AppRuntimeSubagentRunParams) => {
      if (!isGenerationRun(params)) return stubAnalysisRun(params);
      tasks.push(params.task);
      await writeDesignFiles(params, [{ name: 'index.html', content: REVISED_PAGE }]);
      await nameDesign(params, { name: 'Tighter', summary: 'Tighter metrics.' });
      return { response: 'done' };
    });
    await restarted.start();
    await vi.waitFor(async () => {
      expect((await readDesign(harness.paths, 'dsn-1'))?.variants[0]?.status).toBe('ready');
    }, { timeout: 5_000 });
    await restarted.dispose();

    expect(tasks.at(-1)).toContain('Make the metrics tighter');
    expect(tasks.at(-1)).toContain('Generated page');
    const resumed = (await readDesign(harness.paths, 'dsn-1'))!.variants[0]!;
    expect(resumed.revisions).toHaveLength(2);
    expect(resumed.pendingRevision).toBeUndefined();
    expect(
      resumed.revisions.find((entry) => entry.id === baseRevisionId)?.supersededAt,
    ).toBeGreaterThan(0);
  });

  it('shows another revision without generating anything', async () => {
    stubRevisingModel();
    const created = await createDesign();
    const variantId = created.variants[0]!.id;
    const original = created.variants[0]!.revisions[0]!;
    await revise(variantId, 'Make the metrics tighter', 'replace');

    const runs = harness.runStructured.mock.calls.length;
    await appendRequest(harness.paths, {
      kind: 'design.set-visible-revision',
      designId: 'dsn-1',
      variantId,
      revisionId: original.id,
    });
    await harness.coordinator.drain();

    const design = (await readDesign(harness.paths, 'dsn-1'))!;
    expect(design.variants[0]?.visibleRevisionId).toBe(original.id);
    expect(harness.runStructured.mock.calls).toHaveLength(runs);
  });

  it('deletes a revision on request, but never the last one', async () => {
    stubRevisingModel();
    const created = await createDesign();
    const variantId = created.variants[0]!.id;
    const original = created.variants[0]!.revisions[0]!;
    await revise(variantId, 'Make the metrics tighter', 'replace');

    await appendRequest(harness.paths, {
      kind: 'design.delete-revision',
      designId: 'dsn-1',
      variantId,
      revisionId: original.id,
    });
    await harness.coordinator.drain();

    const design = (await readDesign(harness.paths, 'dsn-1'))!;
    expect(design.variants[0]?.revisions).toHaveLength(1);

    await appendRequest(harness.paths, {
      kind: 'design.delete-revision',
      designId: 'dsn-1',
      variantId,
      revisionId: design.variants[0]!.revisions[0]!.id,
    });
    await harness.coordinator.drain();

    // A variant marked ready with no revision has nothing to show and no way
    // back to having one except regenerating.
    expect((await readDesign(harness.paths, 'dsn-1'))?.variants[0]?.revisions).toHaveLength(1);
  });
});
