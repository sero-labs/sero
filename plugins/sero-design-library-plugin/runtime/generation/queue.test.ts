import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { AppRuntimeSubagentRunParams } from '@sero-ai/common';

import type { DesignBrief } from '../../shared/design';
import { revisionDir } from '../../shared/paths';
import { appendRequest, readState } from '../../shared/state-io';
import { PREVIEW_CSP } from '../preview/harness';
import {
  STUB_PAGE,
  isGenerationRun,
  stubAnalysisRun,
  useCoordinator,
  writeDesignFiles,
} from '../coordinator-harness';
import { mutateVariant, readDesign } from '../design-store';
import { reconcileJobs } from '../jobs';
import { listJobs, saveJob } from '../store';

/**
 * Generation end to end, against a stubbed model: a Design is created, its
 * variants run, and each one either produces a document that renders or fails
 * saying why. What these are really about is independence — one variant failing,
 * or being cancelled, must change nothing about its siblings (spec §6.4).
 */

const harness = useCoordinator('generation');

const BRIEF: DesignBrief = {
  request: 'A dense operational dashboard',
  target: 'html',
  variationMode: 'blend',
  variantCount: 2,
  inspirationStrength: 'balanced',
};

async function createDesign(brief: Partial<DesignBrief> = {}): Promise<string> {
  const itemId = await harness.importAndAnalyse('u1', 'shot.png', 'bytes');
  await appendRequest(harness.paths, {
    kind: 'design.create',
    designId: 'dsn-1',
    title: 'Agent operations',
    brief: { ...BRIEF, ...brief },
    referenceItemIds: [itemId],
    resolutions: [],
  });
  await harness.coordinator.drain();
  return 'dsn-1';
}

/** Wait until every variant of the Design has stopped moving. */
async function settled(designId: string) {
  await vi.waitFor(async () => {
    const design = await readDesign(harness.paths, designId);
    expect(design?.variants.every((variant) => variant.status !== 'pending' && variant.status !== 'running')).toBe(true);
  });
  return (await readDesign(harness.paths, designId))!;
}

describe('generating a variant', () => {
  it('renders every variant and points each at a built document', async () => {
    const designId = await createDesign();
    const design = await settled(designId);

    expect(design.variants.map((variant) => variant.status)).toEqual(['ready', 'ready']);

    for (const variant of design.variants) {
      const revision = variant.revisions.at(-1)!;
      expect(variant.visibleRevisionId).toBe(revision.id);
      expect(revision.summary).toBe('Typography-led panel.');
      expect(revision.files.map((file) => file.name)).toEqual(['index.html']);

      // The document exists on disk, carries the policy, and holds the page.
      const directory = revisionDir(harness.paths, designId, variant.id, revision.id);
      const document = await readFile(path.join(directory, revision.builtFile!), 'utf8');
      expect(document).toContain(PREVIEW_CSP);
      expect(document).toContain('Generated page');
      // And the file the model wrote is kept beside it, for the Files tab.
      expect(await readFile(path.join(directory, 'index.html'), 'utf8')).toBe(STUB_PAGE);
    }

    const summary = (await readState(harness.paths)).designs.find((entry) => entry.id === designId);
    expect(summary?.variants.every((variant) => variant.previewPath !== undefined)).toBe(true);
  });

  it('gives the run no platform tools and no reference pixels', async () => {
    await createDesign({ variantCount: 1 });
    await settled('dsn-1');

    const generation = harness.runStructured.mock.calls
      .map((call) => call[0] as AppRuntimeSubagentRunParams)
      .find(isGenerationRun);

    expect(generation?.platformTools).toBe('none');
    expect(generation?.customTools).toHaveLength(1);
    // The Librarian's language, never the image: the analysis is the layer that
    // already excluded logos and recognisable compositions.
    expect(generation?.task).toContain('Technical monochrome');
    expect(generation?.task).toContain('A dense operational dashboard');
  });

  it('carries the frozen guardrails into the brief as requirements', async () => {
    await createDesign({ variantCount: 1 });
    await settled('dsn-1');

    const generation = harness.runStructured.mock.calls
      .map((call) => call[0] as AppRuntimeSubagentRunParams)
      .find((params) => params.task.includes('Guardrails'));

    expect(generation?.task).toContain('Keep geometry square');
    expect(generation?.task).toContain('Decorative gradients');
    expect(generation?.task).toContain('These are not suggestions.');
  });

  it('fails a variant whose run wrote nothing, and keeps its sibling', async () => {
    // The failure mode that matters: a model that describes a page it never
    // wrote returns a perfectly plausible sentence. The runtime decides, not
    // the reply.
    let call = 0;
    harness.runStructured.mockImplementation(async (params: AppRuntimeSubagentRunParams) => {
      if (!isGenerationRun(params)) return stubAnalysisRun(params);
      call += 1;
      if (call === 1) return { response: 'A restrained editorial dashboard.' };
      await writeDesignFiles(params, [{ name: 'index.html', content: STUB_PAGE }]);
      return { response: 'The one that worked.' };
    });

    const design = await settled(await createDesign());

    const statuses = design.variants.map((variant) => variant.status).toSorted();
    expect(statuses).toEqual(['failed', 'ready']);
    const failed = design.variants.find((variant) => variant.status === 'failed');
    expect(failed?.error).toContain('not written any files');
    expect(failed?.revisions).toEqual([]);
    // The successful sibling is untouched by its neighbour's failure.
    const ready = design.variants.find((variant) => variant.status === 'ready');
    expect(ready?.revisions).toHaveLength(1);
  });

  it('fails a variant whose files cannot be built, keeping the files to read', async () => {
    harness.runStructured.mockImplementation(async (params: AppRuntimeSubagentRunParams) => {
      if (!isGenerationRun(params)) return stubAnalysisRun(params);
      // A stylesheet and no entry point: nothing renderable comes out of it.
      await writeDesignFiles(params, [{ name: 'styles.css', content: 'body { margin: 0 }' }]);
      return { response: 'Styles only.' };
    });

    const design = await settled(await createDesign({ variantCount: 1 }));

    // A build warning is a note about a page that works, never a substitute for
    // one that does not exist.
    expect(design.variants[0]?.status).toBe('failed');
    expect(design.variants[0]?.error).toContain('index.html');
  });

  it('retries one failed variant without disturbing the other', async () => {
    let failNext = true;
    harness.runStructured.mockImplementation(async (params: AppRuntimeSubagentRunParams) => {
      if (!isGenerationRun(params)) return stubAnalysisRun(params);
      if (failNext) {
        failNext = false;
        return { response: 'Nothing written.' };
      }
      await writeDesignFiles(params, [{ name: 'index.html', content: STUB_PAGE }]);
      return { response: 'Second attempt.' };
    });

    const designId = await createDesign();
    const first = await settled(designId);
    const failed = first.variants.find((variant) => variant.status === 'failed')!;
    const sibling = first.variants.find((variant) => variant.id !== failed.id)!;
    const siblingRevision = sibling.revisions.at(-1)!.id;

    await appendRequest(harness.paths, {
      kind: 'design.retry-variant',
      designId,
      variantId: failed.id,
    });
    await harness.coordinator.drain();

    const after = await settled(designId);
    expect(after.variants.find((variant) => variant.id === failed.id)?.status).toBe('ready');
    // The sibling kept the revision it already had, rather than regenerating.
    expect(after.variants.find((variant) => variant.id === sibling.id)?.revisions.at(-1)?.id).toBe(
      siblingRevision,
    );
  });
});

describe('cancelling generation', () => {
  it('stops one variant and lets the other finish', async () => {
    let release: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      harness.runStructured.mockImplementationOnce(stubAnalysisRun);
      harness.runStructured.mockImplementationOnce(async (params: AppRuntimeSubagentRunParams) => {
        resolve();
        await new Promise<void>((resolveRelease) => {
          release = resolveRelease;
        });
        await writeDesignFiles(params, [{ name: 'index.html', content: STUB_PAGE }]);
        return { response: 'Held open.' };
      });
    });

    const designId = await createDesign();
    await started;

    const running = (await readDesign(harness.paths, designId))!.variants.find(
      (variant) => variant.status === 'running',
    )!;
    await appendRequest(harness.paths, {
      kind: 'design.cancel-variant',
      designId,
      variantId: running.id,
    });
    await harness.coordinator.drain();
    release();

    const design = await settled(designId);
    expect(design.variants.find((variant) => variant.id === running.id)?.status).toBe('cancelled');
    // The sibling ran on the default stub and is unaffected.
    expect(
      design.variants.find((variant) => variant.id !== running.id)?.status,
    ).toBe('ready');
  });

  it('stops work when the Design is thrown away', async () => {
    const designId = await createDesign();
    await settled(designId);

    await appendRequest(harness.paths, { kind: 'design.delete', designId });
    await harness.coordinator.drain();

    // Nothing is left queued or running against a Design nobody can see.
    const jobs = await listJobs(harness.paths);
    expect(
      jobs.filter((job) => job.kind === 'generate' && (job.status === 'queued' || job.status === 'running')),
    ).toEqual([]);
  });
});

describe('the order a finished variant is recorded in', () => {
  it('never reports a variant ready while its own job still says running', async () => {
    // The variant is what the UI waits on, so anything that reads it and then
    // looks up its job must not find a contradiction. Writing the variant first
    // leaves exactly that window.
    const designId = await createDesign({ variantCount: 1 });

    // Sampled as tightly as the event loop allows rather than through
    // `vi.waitFor`, whose polling interval steps straight over a window this
    // narrow and would report the bug as fixed while it was still there.
    let sawReady = false;
    let jobWhenReady = 'never-observed';
    for (let attempt = 0; attempt < 20_000 && !sawReady; attempt += 1) {
      const design = await readDesign(harness.paths, designId);
      const variant = design?.variants[0];
      if (variant?.status === 'ready') {
        sawReady = true;
        const jobs = await listJobs(harness.paths);
        jobWhenReady = jobs.find((job) => job.id === variant.jobId)?.status ?? 'missing';
      }
    }

    expect(sawReady).toBe(true);
    expect(jobWhenReady).toBe('succeeded');
  });

  it('never leaves a built document missing while the variant claims it', async () => {
    // The record entry naming the files must never exist before the files do.
    const designId = await createDesign({ variantCount: 1 });

    let sawRevision = false;
    let documentExisted = false;
    for (let attempt = 0; attempt < 20_000 && !sawRevision; attempt += 1) {
      const design = await readDesign(harness.paths, designId);
      const revision = design?.variants[0]?.revisions[0];
      if (revision?.builtFile !== undefined) {
        sawRevision = true;
        const directory = revisionDir(
          harness.paths,
          designId,
          design!.variants[0]!.id,
          revision.id,
        );
        documentExisted = await readFile(path.join(directory, revision.builtFile), 'utf8').then(
          () => true,
          () => false,
        );
      }
    }

    expect(sawRevision).toBe(true);
    expect(documentExisted).toBe(true);
  });
});

describe('durability across restart and replay', () => {
  it('does not rebuild a Design when its create request is replayed', async () => {
    // Request application is at-least-once: a crash between applying a request
    // and recording it replays that one request.
    const designId = await createDesign({ variantCount: 1 });
    const before = await settled(designId);
    const revisionId = before.variants[0]!.revisions[0]!.id;

    await appendRequest(harness.paths, {
      kind: 'design.create',
      designId,
      title: 'Agent operations',
      brief: { ...BRIEF, variantCount: 1 },
      referenceItemIds: before.references.map((reference) => reference.itemId),
      resolutions: [],
    });
    await harness.coordinator.drain();

    const after = await readDesign(harness.paths, designId);
    // A fresh record would have new variant ids and no revisions, and every
    // completed variant would be gone with no error anywhere.
    expect(after?.variants[0]?.id).toBe(before.variants[0]!.id);
    expect(after?.variants[0]?.revisions[0]?.id).toBe(revisionId);
    expect(after?.variants[0]?.status).toBe('ready');
  });

  it('leaves a variant resumable when the runtime shuts down mid-run', async () => {
    let release: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      harness.runStructured.mockImplementationOnce(stubAnalysisRun);
      harness.runStructured.mockImplementationOnce(async () => {
        resolve();
        await new Promise<void>((resolveRelease) => {
          release = resolveRelease;
        });
        return { response: 'never got there.' };
      });
    });

    const designId = await createDesign({ variantCount: 1 });
    await started;

    // Quitting Sero, not cancelling. Recording `cancelled` here would retire the
    // variant for good: restart recovery only revisits a job left `running`.
    const disposal = harness.coordinator.dispose();
    release();
    await disposal;

    const design = await readDesign(harness.paths, designId);
    const variant = design!.variants[0]!;
    expect(variant.status).not.toBe('cancelled');

    const job = (await listJobs(harness.paths)).find((entry) => entry.id === variant.jobId);
    expect(job?.status).toBe('running');
    // Which is exactly what reconciliation is for.
    const resumable = await reconcileJobs(harness.paths);
    expect(resumable.map((entry) => entry.id)).toContain(job?.id);
  });

  it('keeps a cancellation across a restart rather than resurrecting the work', async () => {
    const designId = await createDesign({ variantCount: 1 });
    const design = await settled(designId);
    const variantId = design.variants[0]!.id;

    // A cancel that landed while the process was still running the job, and a
    // crash before the run noticed it.
    const jobId = design.variants[0]!.jobId!;
    await mutateVariant(harness.paths, designId, variantId, (variant) => ({
      ...variant,
      status: 'running',
    }));
    await saveJob(harness.paths, {
      ...(await listJobs(harness.paths)).find((entry) => entry.id === jobId)!,
      status: 'running',
      cancelRequested: true,
    });

    await reconcileJobs(harness.paths);

    const job = (await listJobs(harness.paths)).find((entry) => entry.id === jobId);
    expect(job?.status).toBe('queued');
    // Clearing the flag would resurrect work the user had already stopped.
    expect(job?.cancelRequested).toBe(true);
  });

  it('will not let a finishing run overwrite a variant that was cancelled', async () => {
    let release: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      harness.runStructured.mockImplementationOnce(stubAnalysisRun);
      harness.runStructured.mockImplementationOnce(async (params: AppRuntimeSubagentRunParams) => {
        resolve();
        await new Promise<void>((resolveRelease) => {
          release = resolveRelease;
        });
        await writeDesignFiles(params, [{ name: 'index.html', content: STUB_PAGE }]);
        return { response: 'Finished after the cancel.' };
      });
    });

    const designId = await createDesign({ variantCount: 1 });
    await started;
    const variantId = (await readDesign(harness.paths, designId))!.variants[0]!.id;

    // The variant is marked cancelled while its run is still open, and the run
    // then completes anyway — an abort only *asks* a run to stop, and a model
    // call already in flight can return a whole page afterwards. The job id is
    // unchanged, so ownership alone would let the completion write `ready` and
    // silently undo the cancellation.
    await mutateVariant(harness.paths, designId, variantId, (variant) => ({
      ...variant,
      status: 'cancelled',
      completedAt: Date.now(),
    }));
    release();

    await vi.waitFor(async () => {
      const jobs = await listJobs(harness.paths);
      expect(jobs.every((job) => job.status !== 'running')).toBe(true);
    });

    const after = await readDesign(harness.paths, designId);
    expect(after?.variants[0]?.status).toBe('cancelled');
    expect(after?.variants[0]?.revisions).toEqual([]);
  });
});
