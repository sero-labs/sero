/**
 * `design_library_media`: the artwork tray of a Design.
 *
 * The three actions that ask fal.ai for artwork (`generate`, `retry`,
 * `generate-into-library`) are exempt: they call a paid service. The tray the
 * other actions manage is built without it. A Design copies any reference the
 * plugin made itself into its tray as a ready asset (runtime/reference-assets.ts),
 * and the fixture marks two imported references that way (design-library-fixtures.ts).
 * Source: plugins/sero-design-library-plugin/extension/tools/media.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expectText } from '../expect';
import type { StepContext, ToolProbe } from '../types';
import { createReadyDesign, type ReadyDesign } from './design-library-fixtures';
import { installModelStub, removeModelStub } from './design-library-stub';
import { invoke, libraryHome, poll, pollText, saved } from './design-library-support';

const TOOL = 'design_library_media';

const design = (ctx: StepContext) => saved<ReadyDesign>(ctx, 'design');
/** The asset the steps copy, and the one they hide, restore and purge. */
const kept = (ctx: StepContext) => design(ctx).assetIds[0]!;
const spare = (ctx: StepContext) => design(ctx).assetIds[1]!;

const list = (ctx: StepContext, what: string, test: (text: string) => boolean, includeDeleted = false) =>
  pollText(ctx, what, TOOL, { action: 'list', designId: design(ctx).designId, ...(includeDeleted ? { includeDeleted: true } : {}) }, test);

export const designLibraryMediaProbe: ToolProbe = {
  tool: TOOL,
  exemptions: [
    {
      action: 'generate',
      reason: 'paid outside service',
      detail: 'fal.ai image and video generation, billed per call: the request runs through runtime/media/requests.ts and runtime/media/provider.ts into runtime/media/providers/fal.ts (client.subscribe, queue.fal.run).',
    },
    {
      action: 'retry',
      reason: 'paid outside service',
      detail: 'fal.ai: media.retry starts a new provider job for the asset (runtime/media/requests.ts), the same billed call as generate, in runtime/media/providers/fal.ts.',
    },
    {
      action: 'generate-into-library',
      reason: 'paid outside service',
      detail: 'fal.ai: library.generate starts a media job (runtime/media/requests.ts, runtime/media/library.ts) that calls the billed provider in runtime/media/providers/fal.ts.',
    },
  ],
  steps: [
    {
      action: 'list',
      setup: async (ctx) => {
        installModelStub(ctx);
        ctx.state.design = await createReadyDesign(ctx, { artwork: 2 });
        // A finished job the dismiss step can forget: the analysis run of the first artwork.
        const status = await invoke(ctx, 'design_library_analysis', { action: 'status' });
        const jobs = (status.details as { jobs?: Array<{ id: string; status: string; target: { kind: string; itemId?: string } }> } | null)?.jobs ?? [];
        const job = jobs.find((entry) => entry.status === 'succeeded' && entry.target.itemId === design(ctx).artwork[0]!.id);
        if (!job) throw new Error('no finished analysis job to dismiss');
        ctx.state.jobId = job.id;
      },
      params: (ctx) => ({ action: 'list', designId: design(ctx).designId }),
      expect(result, ctx) {
        // `- <asset> · <capability> · <state>`, then the reference path and prompt (extension/tools/media.ts describeAsset).
        expectText(result, `- ${kept(ctx)} · text-to-image · ready`);
        expectText(result, `- ${spare(ctx)} · text-to-image · ready`);
        expectText(result, 'probe artwork');
      },
    },
    {
      action: 'delete',
      params: (ctx) => ({ action: 'delete', designId: design(ctx).designId, assetId: spare(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Hidden from the tray. Restore it any time; the files stay.');
        await list(ctx, 'the asset to leave the tray', (text) => !text.includes(spare(ctx)));
        await list(ctx, 'the asset to show as deleted', (text) => text.includes(`- ${spare(ctx)} · text-to-image · deleted`), true);
      },
    },
    {
      action: 'restore',
      params: (ctx) => ({ action: 'restore', designId: design(ctx).designId, assetId: spare(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Restored.');
        await list(ctx, 'the asset to return to the tray', (text) => text.includes(`- ${spare(ctx)} · text-to-image · ready`));
      },
    },
    {
      // The artwork's bytes are already in the Library, so the copy links that item rather than making a second one (runtime/media/requests.ts).
      action: 'copy-to-library',
      params: (ctx) => ({ action: 'copy-to-library', designId: design(ctx).designId, assetId: kept(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Copying to the Library as an independent item.');
        await list(ctx, 'the asset to be linked to the Library', (text) => text.includes(`copied to Library (${design(ctx).artwork[0]!.id})`));
      },
    },
    {
      action: 'dismiss-job',
      params: (ctx) => ({ action: 'dismiss-job', jobId: saved<string>(ctx, 'jobId') }),
      async expect(result, ctx) {
        expectText(result, 'Forgotten, if it had finished. A running job is left alone.');
        const jobId = saved<string>(ctx, 'jobId');
        await poll(ctx, 'the job to be forgotten', async () => {
          const status = await invoke(ctx, 'design_library_analysis', { action: 'status' });
          const jobs = (status.details as { jobs?: Array<{ id: string }> } | null)?.jobs ?? [];
          return jobs.every((job) => job.id !== jobId);
        });
        if (fs.existsSync(path.join(await libraryHome(ctx), 'jobs', `${jobId}.json`))) throw new Error('the job record is still on disk');
      },
    },
    {
      action: 'purge',
      params: (ctx) => ({ action: 'purge', designId: design(ctx).designId, assetId: spare(ctx) }),
      async expect(result, ctx) {
        // The apostrophe is the plain one in extension/tools/media.ts.
        expectText(result, "Removed permanently, along with every attempt's files.");
        await list(ctx, 'the asset to be gone', (text) => !text.includes(spare(ctx)), true);
        const folder = path.join(await libraryHome(ctx), 'designs', design(ctx).designId, 'assets', spare(ctx));
        await poll(ctx, 'the asset files to be removed', async () => !fs.existsSync(folder));
        removeModelStub(ctx);
      },
    },
  ],
};
