import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

import type { AppRuntimeSubagentRunParams } from '@sero-ai/common';

import type { DesignBrief } from '../../shared/design';
import { revisionDir } from '../../shared/paths';
import { appendRequest, readState } from '../../shared/state-io';
import { PREVIEW_CSP } from '../preview/harness';
import {
  STUB_PAGE,
  isGenerationRun,
  nameDesign,
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
    sessionRules: [],
  });
  await harness.coordinator.drain();
  return 'dsn-1';
}

/** Wait until every variant of the Design has stopped moving. */
async function settled(designId: string, timeout = 5_000) {
  await vi.waitFor(async () => {
    const design = await readDesign(harness.paths, designId);
    expect(design?.variants.every((variant) => variant.status !== 'pending' && variant.status !== 'running')).toBe(true);
  }, { timeout });
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
      // The run names its own design; the tab shows the name, not the number.
      expect(revision.name).toBe('Signal ledger');
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
    expect((generation?.customTools ?? []).map((tool) => (tool as ToolDefinition).name)).toEqual([
      'design_library_write_file',
      'design_library_name_design',
    ]);
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

  it('asks a run that never named its design to name it, and ships it anyway', async () => {
    harness.runStructured.mockImplementation(async (params: AppRuntimeSubagentRunParams) => {
      if (!isGenerationRun(params)) return stubAnalysisRun(params);
      await writeDesignFiles(params, [{ name: 'index.html', content: STUB_PAGE }]);
      return { response: 'Wrote it, said nothing.' };
    });

    const generationParams = () =>
      harness.runStructured.mock.calls
        .map((call) => call[0] as AppRuntimeSubagentRunParams)
        .find(isGenerationRun);

    const design = await settled(await createDesign({ variantCount: 1 }));

    // The run is sent back for the name — the host applies `repair`, so the
    // stub never sees it and the contract is checked here instead.
    expect(generationParams()?.repair?.validate('Wrote it, said nothing.')).toContain(
      'design_library_name_design',
    );
    // But a page that exists is worth more than a label. The variant is ready
    // and unnamed; the tab falls back to its number.
    expect(design.variants[0]?.status).toBe('ready');
    expect(design.variants[0]?.revisions.at(-1)?.name).toBe('');
  });

  it('fails a variant that wrote no entry point', async () => {
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

  it('keeps a readable revision when the files are there but will not build', async () => {
    harness.runStructured.mockImplementation(async (params: AppRuntimeSubagentRunParams) => {
      if (!isGenerationRun(params)) return stubAnalysisRun(params);
      // The entry point is there, so the run is accepted — and then it does not
      // compile, which is the case where files exist with nothing to show for
      // them.
      await writeDesignFiles(params, [
        { name: 'App.tsx', content: 'export default function App( {' },
      ]);
      await nameDesign(params, { name: 'Broken build', summary: 'Did not compile.' });
      return { response: 'Wrote it.' };
    });

    // The React build is a real esbuild run, so this one is given longer than
    // the HTML fixtures need.
    const design = await settled(await createDesign({ variantCount: 1, target: 'react' }), 15_000);
    const variant = design.variants[0];

    expect(variant?.status).toBe('failed');

    // Keeping the files means recording them. A revision names them — with no
    // `builtFile`, because there is nothing to preview — so they can be read;
    // files nothing points at are unreachable from the UI and the startup sweep
    // deletes them as orphans.
    const revision = variant?.revisions.at(-1);
    expect(revision?.files.map((file) => file.name)).toEqual(['App.tsx']);
    expect(revision?.builtFile).toBeUndefined();
    expect(variant?.visibleRevisionId).toBe(revision?.id);
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
