/**
 * `design_library_designs`: creating a Design from analysed references,
 * reading it, revising it, and tuning its live controls. The stub model writes
 * the pages (design-library-stub.ts), so every variant is a real generation
 * run through the plugin's queue. Each change is a queued request, so each
 * step waits for the change to show in a read of the record.
 * Source: plugins/sero-design-library-plugin/extension/tools/designs.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expectText } from '../expect';
import type { StepContext, ToolProbe } from '../types';
import { analysedReference } from './design-library-fixtures';
import { installModelStub, removeModelStub } from './design-library-stub';
import {
  invoke, libraryHome, poll, pollText, rand, readDesign, readStateFile, saved, waitForVariant,
} from './design-library-support';

const TOOL = 'design_library_designs';

const designId = (ctx: StepContext) => saved<string>(ctx, 'designId');
const variantId = (ctx: StepContext) => saved<string>(ctx, 'variantId');
const firstRevision = (ctx: StepContext) => saved<string>(ctx, 'firstRevision');

/** The arguments every tweak and revision action takes. */
const target = (ctx: StepContext, revisionId: string) => ({ designId: designId(ctx), variantId: variantId(ctx), revisionId });

async function variantOf(ctx: StepContext) {
  const variant = (await readDesign(ctx, designId(ctx)))?.variants.find((entry) => entry.id === variantId(ctx));
  if (!variant) throw new Error('the variant is gone');
  return variant;
}

/** The tweak state of the first revision. */
async function tweaksOf(ctx: StepContext) {
  const revision = (await variantOf(ctx)).revisions.find((entry) => entry.id === firstRevision(ctx));
  return revision?.tweaks ?? { overrides: {}, checkpoints: [] };
}

async function setTweak(ctx: StepContext, controlId: string, value: string): Promise<void> {
  const done = await invoke(ctx, TOOL, { action: 'set-tweak', ...target(ctx, firstRevision(ctx)), controlId, value });
  if (done.text !== 'Applied.') throw new Error(`set-tweak failed: ${done.text}`);
}

export const designLibraryDesignsProbe: ToolProbe = {
  tool: TOOL,
  steps: [
    {
      action: 'synthesis',
      setup: async (ctx) => {
        installModelStub(ctx);
        ctx.state.reference = (await analysedReference(ctx, 'probe-design-ref')).id;
        ctx.state.title = `Probe design ${rand()}`;
        ctx.state.released = false;
      },
      params: (ctx) => ({ action: 'synthesis', referenceItemIds: [saved<string>(ctx, 'reference')] }),
      expect(result) {
        // The guardrails are the ones the stub Librarian wrote into the analysis.
        expectText(result, 'Always: Keep geometry square');
        expectText(result, 'Never: Decorative gradients');
        expectText(result, 'No blocking conflicts.');
      },
    },
    {
      action: 'create',
      params: (ctx) => ({
        action: 'create', referenceItemIds: [saved<string>(ctx, 'reference')], request: 'A dense operational dashboard',
        title: saved<string>(ctx, 'title'), variantCount: 1, target: 'html',
      }),
      async expect(result, ctx) {
        expectText(result, 'Queued a html Design with 1 variant.');
        const title = saved<string>(ctx, 'title');
        ctx.state.designId = await poll(ctx, `the design ${title}`, async () => {
          const listed = await invoke(ctx, TOOL, { action: 'list' });
          return (listed.details as { designs?: Array<{ id: string; title: string }> } | null)?.designs?.find((design) => design.title === title)?.id ?? null;
        });
        const design = await poll(ctx, 'the first variant to be generated', async () => {
          const found = await readDesign(ctx, designId(ctx));
          const variant = found?.variants[0];
          if (variant?.status === 'failed') throw new Error(`generation failed: ${JSON.stringify(variant)}`);
          return variant?.status === 'ready' && variant.revisions[0]?.builtFile ? found : null;
        }, 90_000);
        ctx.state.variantId = design!.variants[0]!.id;
        ctx.state.firstRevision = design!.variants[0]!.revisions[0]!.id;
      },
    },
    {
      action: 'list',
      params: { action: 'list' },
      expect(result, ctx) {
        expectText(result, `- ${designId(ctx)} — ${saved<string>(ctx, 'title')} · html · 1/1 ready`);
      },
    },
    {
      action: 'get',
      params: (ctx) => ({ action: 'get', designId: designId(ctx) }),
      expect(result, ctx) {
        expectText(result, `${saved<string>(ctx, 'title')} (${designId(ctx)})`);
        expectText(result, 'Request: A dense operational dashboard');
        expectText(result, `${variantId(ctx)} · ready`);
      },
    },
    {
      // Creating a Design selects it, so the selection is cleared first to show that `open` selects it.
      action: 'open',
      setup: async (ctx) => {
        await invoke(ctx, 'design_library_settings', { action: 'set-view', view: { selectedDesignId: null } });
        await poll(ctx, 'the selection to clear', async () => (await readStateFile(ctx)).view?.selectedDesignId === undefined);
      },
      params: (ctx) => ({ action: 'open', designId: designId(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Opened.');
        await poll(ctx, 'the Design to be selected', async () => (await readStateFile(ctx)).view?.selectedDesignId === designId(ctx));
      },
    },
    {
      action: 'rename',
      setup: async (ctx) => { ctx.state.renamed = `Probe renamed ${rand()}`; },
      params: (ctx) => ({ action: 'rename', designId: designId(ctx), title: saved<string>(ctx, 'renamed') }),
      async expect(result, ctx) {
        expectText(result, 'Queued the rename.');
        await pollText(ctx, 'the new title', TOOL, { action: 'get', designId: designId(ctx) }, (text) => text.startsWith(`${saved<string>(ctx, 'renamed')} (`));
      },
    },
    {
      action: 'files-location',
      params: (ctx) => ({ action: 'files-location', ...target(ctx, firstRevision(ctx)) }),
      async expect(result, ctx) {
        expectText(result, 'Files are ready to open.');
        // The folder is in the tool's details, and holds the page the run wrote.
        const located = await invoke(ctx, TOOL, { action: 'files-location', ...target(ctx, firstRevision(ctx)) });
        const folder = (located.details as { folder?: string } | null)?.folder;
        const expected = path.join(await libraryHome(ctx), 'designs', designId(ctx), 'variants', variantId(ctx), firstRevision(ctx));
        if (folder !== expected || !fs.existsSync(path.join(folder, 'index.html'))) throw new Error(`unexpected files folder ${folder}`);
      },
    },
    {
      // The tweaks are set on the first revision. Control ids are the Typography baseline every page declares.
      action: 'set-tweak',
      params: (ctx) => ({ action: 'set-tweak', ...target(ctx, firstRevision(ctx)), controlId: 'h1-size', value: '60' }),
      async expect(result, ctx) {
        expectText(result, 'Applied.');
        await poll(ctx, 'the H1 size override', async () => Number((await tweaksOf(ctx)).overrides['h1-size']) === 60);
      },
    },
    {
      action: 'reset-tweak',
      setup: async (ctx) => {
        await setTweak(ctx, 'h2-size', '30');
        await poll(ctx, 'the H2 size override', async () => Number((await tweaksOf(ctx)).overrides['h2-size']) === 30);
      },
      params: (ctx) => ({ action: 'reset-tweak', ...target(ctx, firstRevision(ctx)), controlId: 'h2-size' }),
      async expect(result, ctx) {
        expectText(result, 'Back to the value this design shipped with.');
        // Only that control goes back; the other keeps its value.
        await poll(ctx, 'the H2 override to clear', async () => {
          const { overrides } = await tweaksOf(ctx);
          return overrides['h2-size'] === undefined && Number(overrides['h1-size']) === 60;
        });
      },
    },
    {
      action: 'checkpoint-tweaks',
      params: (ctx) => ({ action: 'checkpoint-tweaks', ...target(ctx, firstRevision(ctx)) }),
      async expect(result, ctx) {
        expectText(result, 'Checkpointed.');
        const { checkpoints } = await poll(ctx, 'a checkpoint', async () => {
          const state = await tweaksOf(ctx);
          return state.checkpoints.length === 1 ? state : null;
        });
        if (Number(checkpoints[0]!.overrides['h1-size']) !== 60) throw new Error(`the checkpoint holds ${JSON.stringify(checkpoints[0])}`);
        ctx.state.checkpointId = checkpoints[0]!.id;
      },
    },
    {
      action: 'reset-tweaks',
      params: (ctx) => ({ action: 'reset-tweaks', ...target(ctx, firstRevision(ctx)) }),
      async expect(result, ctx) {
        expectText(result, 'All controls reset. The previous values are recoverable.');
        await poll(ctx, 'every override to clear', async () => Object.keys((await tweaksOf(ctx)).overrides).length === 0);
      },
    },
    {
      action: 'restore-tweaks',
      params: (ctx) => ({ action: 'restore-tweaks', ...target(ctx, firstRevision(ctx)), checkpointId: saved<string>(ctx, 'checkpointId') }),
      async expect(result, ctx) {
        expectText(result, 'Restored those values.');
        await poll(ctx, 'the checkpointed values to return', async () => Number((await tweaksOf(ctx)).overrides['h1-size']) === 60);
      },
    },
    {
      // The instruction holds the generation run (HOLD-PROBE), so the variant stays running for the cancel that follows.
      action: 'revise-variant',
      params: (ctx) => ({
        action: 'revise-variant', designId: designId(ctx), variantId: variantId(ctx), behaviour: 'retain',
        instruction: 'REVISE-PROBE HOLD-PROBE make the heading bolder',
      }),
      async expect(result, ctx) {
        expectText(result, 'Revising. The result joins this variant as another revision.');
        const variant = await waitForVariant(ctx, designId(ctx), variantId(ctx), 'to start revising', (entry) => entry.status === 'running');
        if (!variant.pendingRevision?.instruction.includes('REVISE-PROBE')) throw new Error(`the variant carries no revision: ${JSON.stringify(variant)}`);
      },
    },
    {
      action: 'cancel-variant',
      params: (ctx) => ({ action: 'cancel-variant', designId: designId(ctx), variantId: variantId(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Cancelling that variant. Its siblings keep running.');
        await waitForVariant(ctx, designId(ctx), variantId(ctx), 'to be cancelled', (entry) => entry.status === 'cancelled');
        // The held run is over; the retry that follows must be allowed to finish.
        ctx.state.released = true;
      },
    },
    {
      action: 'retry-variant',
      params: (ctx) => ({ action: 'retry-variant', designId: designId(ctx), variantId: variantId(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Queued a retry for that variant. Its siblings are untouched.');
        const variant = await waitForVariant(ctx, designId(ctx), variantId(ctx), 'to be generated again', (entry) => {
          if (entry.status === 'failed') throw new Error(`the retry failed: ${JSON.stringify(entry)}`);
          return entry.status === 'ready' && entry.revisions.length === 2;
        });
        ctx.state.secondRevision = variant.revisions.find((revision) => revision.id !== firstRevision(ctx))!.id;
      },
    },
    {
      action: 'show-revision',
      params: (ctx) => ({ action: 'show-revision', ...target(ctx, firstRevision(ctx)) }),
      async expect(result, ctx) {
        expectText(result, 'Showing that revision.');
        // The retry's revision was showing; now the original is.
        await waitForVariant(ctx, designId(ctx), variantId(ctx), 'to show the first revision', (entry) => entry.visibleRevisionId === firstRevision(ctx));
      },
    },
    {
      action: 'delete-revision',
      params: (ctx) => ({ action: 'delete-revision', ...target(ctx, saved<string>(ctx, 'secondRevision')) }),
      async expect(result, ctx) {
        expectText(result, 'Deleted that revision and the files it held.');
        await waitForVariant(ctx, designId(ctx), variantId(ctx), 'to lose a revision', (entry) =>
          entry.revisions.length === 1 && entry.revisions[0]!.id === firstRevision(ctx));
        const folder = path.join(await libraryHome(ctx), 'designs', designId(ctx), 'variants', variantId(ctx), saved<string>(ctx, 'secondRevision'));
        await poll(ctx, 'the revision files to be removed', async () => !fs.existsSync(folder));
      },
    },
    {
      action: 'delete',
      params: (ctx) => ({ action: 'delete', designId: designId(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Moved to Trash. Restore it any time; nothing generated is removed.');
        await pollText(ctx, 'the Design to leave the list', TOOL, { action: 'list' }, (text) => !text.includes(designId(ctx)));
        // Trash keeps it.
        const trash = await invoke(ctx, TOOL, { action: 'list', includeDeleted: true });
        expectText({ ...result, text: trash.text }, designId(ctx));
      },
    },
    {
      action: 'restore',
      params: (ctx) => ({ action: 'restore', designId: designId(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Restored.');
        await pollText(ctx, 'the Design to return to the list', TOOL, { action: 'list' }, (text) => text.includes(designId(ctx)));
        removeModelStub(ctx);
      },
    },
  ],
};
