/**
 * `design_library_gallery`: saving a Design revision as an immutable Gallery
 * version, and managing the versions and the family they belong to. A save
 * needs the preview picture the app captured, which the probe stages as a
 * `gallery-preview` upload. Each change is a queued request, so each step
 * waits for it to show in the list.
 * Source: plugins/sero-design-library-plugin/extension/tools/gallery.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expectText } from '../expect';
import type { StepContext, ToolProbe } from '../types';
import {
  createReadyDesign, galleryFamilies, stagePreview, type GalleryFamilyView, type ReadyDesign,
} from './design-library-fixtures';
import { installModelStub, removeModelStub } from './design-library-stub';
import { invoke, libraryHome, poll, pollText, readStateFile, saved } from './design-library-support';

const TOOL = 'design_library_gallery';

const design = (ctx: StepContext) => saved<ReadyDesign>(ctx, 'design');
const familyId = (ctx: StepContext) => saved<GalleryFamilyView>(ctx, 'family').id;
const first = (ctx: StepContext) => saved<GalleryFamilyView>(ctx, 'family').versions[0]!.id;
const second = (ctx: StepContext) => saved<string>(ctx, 'secondVersion');

async function family(ctx: StepContext): Promise<GalleryFamilyView | undefined> {
  return (await galleryFamilies(ctx)).find((entry) => entry.id === familyId(ctx));
}

async function version(ctx: StepContext, versionId: string) {
  return (await family(ctx))?.versions.find((entry) => entry.id === versionId);
}

export const designLibraryGalleryProbe: ToolProbe = {
  tool: TOOL,
  steps: [
    {
      // The first save also names the family; the stage is a fresh preview picture and a ready Design.
      action: 'save',
      setup: async (ctx) => {
        installModelStub(ctx);
        ctx.state.design = await createReadyDesign(ctx);
        Object.assign(ctx.state, { firstPreview: await stagePreview(ctx) });
      },
      params: (ctx) => ({
        action: 'save', designId: design(ctx).designId, variantId: design(ctx).variantId, revisionId: design(ctx).revisionId,
        previewUploadId: saved<{ uploadId: string }>(ctx, 'firstPreview').uploadId,
      }),
      async expect(result, ctx) {
        expectText(result, 'Saving this exact revision to Gallery.');
        const saved1 = await poll(ctx, 'the first Gallery version', async () => {
          const found = (await galleryFamilies(ctx)).find((entry) => entry.sourceDesignId === design(ctx).designId);
          return found && found.versions.length === 1 ? found : null;
        });
        ctx.state.family = saved1;
        // The version's folder holds the saved source.
        const folder = path.join(await libraryHome(ctx), 'gallery', saved1.id, 'versions', saved1.versions[0]!.id);
        if (!fs.existsSync(path.join(folder, 'source', 'index.html'))) throw new Error('the version holds no copy of the source');
      },
    },
    {
      // A second save of the same revision makes a second version; it becomes the featured one.
      action: 'save',
      setup: async (ctx) => { ctx.state.secondPreview = await stagePreview(ctx); },
      params: (ctx) => ({
        action: 'save', designId: design(ctx).designId, variantId: design(ctx).variantId, revisionId: design(ctx).revisionId,
        previewUploadId: saved<{ uploadId: string }>(ctx, 'secondPreview').uploadId,
      }),
      async expect(result, ctx) {
        expectText(result, 'Saving this exact revision to Gallery.');
        const both = await poll(ctx, 'the second Gallery version', async () => {
          const found = await family(ctx);
          return found && found.versions.length === 2 ? found : null;
        });
        ctx.state.secondVersion = both.versions.find((entry) => entry.id !== first(ctx))!.id;
        if (both.featuredVersionId !== second(ctx)) throw new Error('the newest save did not become the featured version');
      },
    },
    {
      action: 'list',
      params: { action: 'list' },
      expect: (result, ctx) => expectText(result, `- ${familyId(ctx)} — ${design(ctx).title} · 2 version(s)`),
    },
    {
      // The stub names every revision "Signal ledger" with this summary (design-library-stub.ts).
      action: 'get',
      params: (ctx) => ({ action: 'get', familyId: familyId(ctx), versionId: first(ctx) }),
      expect: (result) => expectText(result, 'Signal ledger — Typography-led panel.'),
    },
    {
      action: 'preview',
      params: (ctx) => ({ action: 'preview', familyId: familyId(ctx), versionId: first(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Signal ledger');
        const expected = saved<{ png: Buffer }>(ctx, 'firstPreview').png.toString('base64');
        if (result.images[0] && result.images[0].data !== expected) throw new Error('the preview the step returned is not the saved picture');
        const direct = await invoke(ctx, TOOL, { action: 'preview', familyId: familyId(ctx), versionId: first(ctx) });
        if (direct.images[0]?.data !== expected || direct.images[0].mimeType !== 'image/png') throw new Error('the stored preview is not the picture that was saved');
      },
    },
    {
      action: 'feature',
      params: (ctx) => ({ action: 'feature', familyId: familyId(ctx), versionId: first(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Featured that version.');
        await poll(ctx, 'the first version to be featured', async () => (await family(ctx))?.featuredVersionId === first(ctx));
      },
    },
    {
      action: 'favourite',
      params: (ctx) => ({ action: 'favourite', familyId: familyId(ctx), favourite: true }),
      async expect(result, ctx) {
        expectText(result, 'Added to favourites.');
        await poll(ctx, 'the family to be a favourite', async () => (await family(ctx))?.favourite === true);
      },
    },
    {
      // The copy is a new Design in a new family, and it is selected. Its title is "<family title> copy" (runtime/gallery-duplicate.ts).
      action: 'duplicate',
      params: (ctx) => ({ action: 'duplicate', familyId: familyId(ctx), versionId: first(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Creating an exact editable Design copy in a new family.');
        const copyTitle = `${design(ctx).title} copy`;
        const copyId = await poll(ctx, 'the Design copy', async () => {
          const listed = await invoke(ctx, 'design_library_designs', { action: 'list' });
          return (listed.details as { designs?: Array<{ id: string; title: string }> } | null)?.designs?.find((entry) => entry.title === copyTitle)?.id ?? null;
        });
        if (copyId === design(ctx).designId) throw new Error('the copy reuses the original Design');
        await poll(ctx, 'the copy to be selected', async () => (await readStateFile(ctx)).view?.selectedDesignId === copyId);
      },
    },
    {
      // The saved revision comes back up in its source Design, which is selected again.
      action: 'open',
      params: (ctx) => ({ action: 'open', familyId: familyId(ctx), versionId: first(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Opening the exact saved revision.');
        await poll(ctx, 'the source Design to be selected', async () => (await readStateFile(ctx)).view?.selectedDesignId === design(ctx).designId);
      },
    },
    {
      action: 'delete-version',
      params: (ctx) => ({ action: 'delete-version', familyId: familyId(ctx), versionId: second(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Moved that version to Trash.');
        await poll(ctx, 'the version to be in Trash', async () => (await version(ctx, second(ctx)))?.deletedAt !== undefined);
      },
    },
    {
      action: 'restore-version',
      params: (ctx) => ({ action: 'restore-version', familyId: familyId(ctx), versionId: second(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Restored.');
        await poll(ctx, 'the version to leave Trash', async () => {
          const restored = await version(ctx, second(ctx));
          return restored !== undefined && restored.deletedAt === undefined;
        });
      },
    },
    {
      action: 'purge-version',
      params: (ctx) => ({ action: 'purge-version', familyId: familyId(ctx), versionId: second(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Permanently deleted that version.');
        await poll(ctx, 'the version to be gone', async () => (await version(ctx, second(ctx))) === undefined);
        // The record changes first and the folder goes a moment later.
        const folder = path.join(await libraryHome(ctx), 'gallery', familyId(ctx), 'versions', second(ctx));
        await poll(ctx, 'the purged version folder to leave the disk', async () => !fs.existsSync(folder));
      },
    },
    {
      action: 'delete-family',
      params: (ctx) => ({ action: 'delete-family', familyId: familyId(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Moved the family to Trash.');
        await pollText(ctx, 'the family to leave the list', TOOL, { action: 'list' }, (text) => !text.includes(familyId(ctx)));
      },
    },
    {
      action: 'restore-family',
      params: (ctx) => ({ action: 'restore-family', familyId: familyId(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Restored.');
        await pollText(ctx, 'the family to return to the list', TOOL, { action: 'list' }, (text) => text.includes(familyId(ctx)));
      },
    },
    {
      action: 'purge-family',
      params: (ctx) => ({ action: 'purge-family', familyId: familyId(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Permanently deleted the family and every version it owned.');
        await poll(ctx, 'the family to be gone', async () => (await family(ctx)) === undefined);
        if (fs.existsSync(path.join(await libraryHome(ctx), 'gallery', familyId(ctx)))) throw new Error('the purged family folder is still on disk');
        removeModelStub(ctx);
      },
    },
  ],
};
