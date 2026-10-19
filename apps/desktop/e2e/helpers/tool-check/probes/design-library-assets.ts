/**
 * `design_library_assets`: bytes in and out of the Library. The upload steps
 * run in the order a real import takes (begin, chunk, complete); the reads
 * then fetch what the import stored. Source: plugins/sero-design-library-plugin/extension/tools/assets.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expectText } from '../expect';
import type { StepContext, ToolCallResult, ToolProbe } from '../types';
import { createReadyDesign, type ReadyDesign } from './design-library-fixtures';
import { installModelStub, PAGE_MARKER, removeModelStub } from './design-library-stub';
import {
  detailsOf, expectMatch, findItemId, invoke, itemText, libraryHome, makePng, poll, rand, readJsonFile, saved,
  waitForAnalysis,
} from './design-library-support';

const TOOL = 'design_library_assets';

const png = (ctx: StepContext) => saved<Buffer>(ctx, 'png');
const itemId = (ctx: StepContext) => saved<string>(ctx, 'itemId');
const design = (ctx: StepContext) => saved<ReadyDesign>(ctx, 'design');

async function uploadDir(ctx: StepContext, uploadId: string): Promise<string> {
  return path.join(await libraryHome(ctx), 'uploads', uploadId);
}

/** The image a read step returned must be the bytes that were imported. */
async function expectImage(result: ToolCallResult, ctx: StepContext, params: Record<string, unknown>, expected: Buffer): Promise<void> {
  const own = result.images[0];
  if (own && own.data !== expected.toString('base64')) throw new Error('the image the step returned is not the imported file');
  // Read the stored bytes again without the CLI in between, so a CLI that drops images cannot hide a wrong file.
  const direct = await invoke(ctx, TOOL, params);
  if (direct.images[0]?.data !== expected.toString('base64')) throw new Error('the stored file is not the imported bytes');
}

export const designLibraryAssetsProbe: ToolProbe = {
  tool: TOOL,
  steps: [
    {
      action: 'begin',
      setup: async (ctx) => {
        installModelStub(ctx);
        ctx.state.png = makePng();
        ctx.state.fileName = `probe-assets-${rand()}.png`;
      },
      params: (ctx) => ({
        action: 'begin', fileName: saved<string>(ctx, 'fileName'), mediaType: 'image/png', originalChunks: 1, previewChunks: 0, width: 8, height: 8,
      }),
      async expect(result, ctx) {
        const uploadId = expectMatch(result, /^Upload ([0-9a-f-]{36}) ready for 1 chunks\.$/)[1]!;
        ctx.state.uploadId = uploadId;
        const manifest = readJsonFile(path.join(await uploadDir(ctx, uploadId), 'manifest.json')) as { fileName?: string; mediaType?: string; complete?: boolean } | null;
        if (!manifest || manifest.fileName !== ctx.state.fileName || manifest.mediaType !== 'image/png' || manifest.complete !== false) {
          throw new Error(`unexpected upload manifest: ${JSON.stringify(manifest)}`);
        }
      },
    },
    {
      action: 'chunk',
      params: (ctx) => ({ action: 'chunk', uploadId: saved<string>(ctx, 'uploadId'), role: 'original', index: 0, data: png(ctx).toString('base64') }),
      async expect(result, ctx) {
        expectText(result, `Stored original chunk 0 (${png(ctx).length} bytes).`);
        const stored = fs.readFileSync(path.join(await uploadDir(ctx, saved<string>(ctx, 'uploadId')), 'original', '0.part'));
        if (!stored.equals(png(ctx))) throw new Error('the stored chunk is not the bytes that were sent');
      },
    },
    {
      action: 'complete',
      params: (ctx) => ({ action: 'complete', uploadId: saved<string>(ctx, 'uploadId') }),
      async expect(result, ctx) {
        expectText(result, 'Upload complete; import queued.');
        // The runtime turns the upload into an item and clears the staging folder.
        ctx.state.itemId = await poll(ctx, 'the imported item', () => findItemId(ctx, saved<string>(ctx, 'fileName')));
        const original = path.join(await libraryHome(ctx), 'items', itemId(ctx), 'original.png');
        if (!fs.readFileSync(original).equals(png(ctx))) throw new Error('the item holds different bytes than were uploaded');
        await poll(ctx, 'the staging folder to be cleared', async () => !fs.existsSync(await uploadDir(ctx, saved<string>(ctx, 'uploadId'))));
      },
    },
    {
      // No separate preview was sent, so the item's preview is its original (runtime/ingest.ts).
      action: 'preview',
      params: (ctx) => ({ action: 'preview', itemId: itemId(ctx) }),
      async expect(result, ctx) {
        expectMatch(result, /\(preview\)/);
        await expectImage(result, ctx, { action: 'preview', itemId: itemId(ctx) }, png(ctx));
      },
    },
    {
      action: 'original',
      params: (ctx) => ({ action: 'original', itemId: itemId(ctx) }),
      async expect(result, ctx) {
        expectMatch(result, /\(original\)/);
        await expectImage(result, ctx, { action: 'original', itemId: itemId(ctx) }, png(ctx));
      },
    },
    {
      action: 'stream',
      params: (ctx) => ({ action: 'stream', itemId: itemId(ctx), offset: 0 }),
      async expect(result, ctx) {
        // extension/tools/item-files.ts: `Bytes ${start}–${start + bytesRead} of ${size}.`
        expectText(result, `Bytes 0–${png(ctx).length} of ${png(ctx).length}.`);
        const direct = await invoke(ctx, TOOL, { action: 'stream', itemId: itemId(ctx), offset: 0 });
        const data = (direct.details as { data?: string } | null)?.data;
        if (data !== png(ctx).toString('base64')) throw new Error('the streamed bytes are not the imported file');
      },
    },
    {
      action: 'abort',
      setup: async (ctx) => {
        // A second upload that is started and fed, but never completed.
        const begun = await invoke(ctx, TOOL, { action: 'begin', fileName: `probe-abort-${rand()}.png`, mediaType: 'image/png', originalChunks: 1, previewChunks: 0 });
        const uploadId = detailsOf<{ uploadId: string }>(begun).uploadId;
        await invoke(ctx, TOOL, { action: 'chunk', uploadId, role: 'original', index: 0, data: makePng().toString('base64') });
        if (!fs.existsSync(path.join(await uploadDir(ctx, uploadId), 'original', '0.part'))) throw new Error('the upload to abort was not staged');
        ctx.state.abortId = uploadId;
      },
      params: (ctx) => ({ action: 'abort', uploadId: saved<string>(ctx, 'abortId') }),
      async expect(result, ctx) {
        expectText(result, 'Upload discarded.');
        if (fs.existsSync(await uploadDir(ctx, saved<string>(ctx, 'abortId')))) throw new Error('the aborted upload is still on disk');
      },
    },
    {
      // A Design with plugin artwork gives both a revision file and a tray asset to read.
      action: 'design-file',
      setup: async (ctx) => {
        ctx.state.design = await createReadyDesign(ctx, { artwork: 1 });
      },
      params: (ctx) => ({
        action: 'design-file', designId: design(ctx).designId, variantId: design(ctx).variantId, revisionId: design(ctx).revisionId, fileName: 'index.html',
      }),
      expect: (result) => expectText(result, PAGE_MARKER),
    },
    {
      action: 'design-asset',
      params: (ctx) => ({ action: 'design-asset', designId: design(ctx).designId, assetId: design(ctx).assetIds[0], which: 'media' }),
      async expect(result, ctx) {
        // The caption is the asset's prompt, which the plugin takes from the artwork's provenance.
        expectText(result, 'probe artwork');
        await expectImage(
          result, ctx,
          { action: 'design-asset', designId: design(ctx).designId, assetId: design(ctx).assetIds[0], which: 'media' },
          design(ctx).artwork[0]!.png,
        );
      },
    },
    {
      // A video's poster and filmstrip arrive as an upload with no original. Sent for the first item, the poster becomes its preview.
      action: 'attach-frames',
      setup: async (ctx) => {
        const poster = makePng();
        const strip = makePng();
        const begun = await invoke(ctx, TOOL, { action: 'begin', fileName: `probe-frames-${rand()}.png`, mediaType: 'image/png', originalChunks: 0, previewChunks: 1, framesChunks: 1 });
        const uploadId = detailsOf<{ uploadId: string }>(begun).uploadId;
        await invoke(ctx, TOOL, { action: 'chunk', uploadId, role: 'preview', index: 0, data: poster.toString('base64') });
        await invoke(ctx, TOOL, { action: 'chunk', uploadId, role: 'frames', index: 0, data: strip.toString('base64') });
        Object.assign(ctx.state, { framesUpload: uploadId, poster, strip });
      },
      params: (ctx) => ({ action: 'attach-frames', uploadId: saved<string>(ctx, 'framesUpload'), itemId: itemId(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Frames queued.');
        const dir = path.join(await libraryHome(ctx), 'items', itemId(ctx));
        // The runtime writes the files, then the record that names them, so the preview changing is the last effect.
        const poster = saved<Buffer>(ctx, 'poster').toString('base64');
        await poll(ctx, 'the item preview to become the poster', async () =>
          (await invoke(ctx, TOOL, { action: 'preview', itemId: itemId(ctx) })).images[0]?.data === poster);
        if (!fs.readFileSync(path.join(dir, 'poster.webp')).equals(saved<Buffer>(ctx, 'poster'))) throw new Error('poster.webp is not the preview chunk');
        if (!fs.readFileSync(path.join(dir, 'frames.webp')).equals(saved<Buffer>(ctx, 'strip'))) throw new Error('frames.webp is not the frames chunk');
        // The reference is looked at again.
        await poll(ctx, 'the reanalysis to start', async () => !(await itemText(ctx, itemId(ctx))).includes('Analysis: ready'), 10_000).catch(() => undefined);
        await waitForAnalysis(ctx, itemId(ctx), 'ready');
        removeModelStub(ctx);
      },
    },
  ],
};
