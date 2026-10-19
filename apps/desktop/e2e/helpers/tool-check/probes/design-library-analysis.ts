/**
 * `design_library_analysis`: asking the Librarian to look at a reference
 * again, or to stop. The stub Librarian (design-library-stub.ts) answers each
 * run; `ctx.state.librarian` makes it finish, never finish, or answer badly,
 * so a cancel has a run to cancel and a retry has a failure to retry.
 * Source: plugins/sero-design-library-plugin/extension/tools/analysis.ts.
 */
import { expectText } from '../expect';
import type { StepContext, ToolProbe } from '../types';
import { analysedReference } from './design-library-fixtures';
import { installModelStub, removeModelStub } from './design-library-stub';
import {
  expectMatch, importReference, itemText, poll, saved, waitForAnalysis,
} from './design-library-support';

const TOOL = 'design_library_analysis';

const itemId = (ctx: StepContext) => saved<string>(ctx, 'itemId');

/** The first line of an item's text is `<title> (<id>)`. */
async function titleOf(ctx: StepContext, id: string): Promise<string> {
  return (await itemText(ctx, id)).split('\n')[0]!;
}

export const designLibraryAnalysisProbe: ToolProbe = {
  tool: TOOL,
  steps: [
    {
      action: 'status',
      setup: async (ctx) => {
        installModelStub(ctx);
        await analysedReference(ctx, 'probe-analysis-ok');
      },
      params: { action: 'status' },
      // Other probes leave their own references, so the count is not pinned: at least the one just analysed is `ready`.
      expect(result) { expectMatch(result, /^\d+ references: .*\b[1-9]\d* ready\b/); },
    },
    {
      action: 'cancel',
      setup: async (ctx) => {
        // The Librarian keeps asking for the image, so this analysis stays running.
        ctx.state.librarian = 'hold';
        const held = await importReference(ctx, 'probe-analysis-held');
        ctx.state.itemId = held.id;
        await waitForAnalysis(ctx, held.id, 'running');
      },
      params: (ctx) => ({ action: 'cancel', itemId: itemId(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Queued a cancellation.');
        await waitForAnalysis(ctx, itemId(ctx), 'cancelled');
        ctx.state.librarian = 'ok';
      },
    },
    {
      // A cancelled analysis is not `ready`, so an unforced `analyse` starts it again.
      action: 'analyse',
      params: (ctx) => ({ action: 'analyse', itemId: itemId(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Queued analysis.');
        await waitForAnalysis(ctx, itemId(ctx), 'ready');
      },
    },
    {
      // Each Librarian run titles the item by its own run number, so a new analysis shows as a new title.
      action: 'reanalyse',
      setup: async (ctx) => { ctx.state.titleBefore = await titleOf(ctx, itemId(ctx)); },
      params: (ctx) => ({ action: 'reanalyse', itemId: itemId(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Queued reanalysis. Fields you edited by hand are kept.');
        const before = saved<string>(ctx, 'titleBefore');
        await poll(ctx, 'a new analysis to replace the title', async () => {
          const text = await itemText(ctx, itemId(ctx));
          return text.includes('Analysis: ready') && text.split('\n')[0] !== before;
        });
      },
    },
    {
      action: 'retry',
      setup: async (ctx) => {
        // An analysis the Librarian answers with no usable JSON fails, and is the thing to retry.
        ctx.state.librarian = 'bad';
        const failed = await importReference(ctx, 'probe-analysis-failed');
        ctx.state.itemId = failed.id;
        await waitForAnalysis(ctx, failed.id, 'failed');
        ctx.state.librarian = 'ok';
      },
      params: (ctx) => ({ action: 'retry', itemId: itemId(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Queued a retry.');
        await waitForAnalysis(ctx, itemId(ctx), 'ready');
        removeModelStub(ctx);
      },
    },
  ],
};
