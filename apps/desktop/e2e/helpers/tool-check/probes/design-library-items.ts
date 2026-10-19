/**
 * `design_library_items`: searching, reading and editing Library items, and
 * the collections that group them. Every change is a queued request, so each
 * step waits for the change to show in a read.
 * Source: plugins/sero-design-library-plugin/extension/tools/items.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expectText } from '../expect';
import type { StepContext, ToolProbe } from '../types';
import { analysedReference } from './design-library-fixtures';
import { installModelStub, removeModelStub } from './design-library-stub';
import {
  expectMatch, importReference, invoke, itemText, libraryHome, poll, pollText, rand, saved,
} from './design-library-support';

const TOOL = 'design_library_items';

const itemId = (ctx: StepContext) => saved<string>(ctx, 'itemId');
const collectionId = (ctx: StepContext) => saved<string>(ctx, 'collectionId');

interface IndexEntry {
  id: string;
  favourite: boolean;
  collectionIds: string[];
}

async function search(ctx: StepContext, query: string): Promise<{ text: string; items: IndexEntry[] }> {
  const found = await invoke(ctx, TOOL, { action: 'search', query, limit: 50 });
  return { text: found.text, items: (found.details as { items?: IndexEntry[] } | null)?.items ?? [] };
}

const collections = (ctx: StepContext, test: (text: string) => boolean, what: string) =>
  pollText(ctx, what, TOOL, { action: 'collections' }, test);

export const designLibraryItemsProbe: ToolProbe = {
  tool: TOOL,
  steps: [
    {
      action: 'search',
      setup: async (ctx) => {
        installModelStub(ctx);
        const kept = await analysedReference(ctx, 'probe-items');
        // A second item, left to be purged.
        const purged = await importReference(ctx, 'probe-items-purge');
        Object.assign(ctx.state, { itemId: kept.id, fileName: kept.fileName, purgeId: purged.id, purgeName: purged.fileName });
      },
      params: (ctx) => ({ action: 'search', query: saved<string>(ctx, 'fileName'), limit: 50 }),
      async expect(result, ctx) {
        // The file name finds the item, and only it.
        expectMatch(result, /^1 reference matched:/);
        expectText(result, `- ${itemId(ctx)} — `);
      },
    },
    {
      action: 'get',
      params: (ctx) => ({ action: 'get', itemId: itemId(ctx) }),
      expect(result, ctx) {
        expectText(result, `(${itemId(ctx)})`);
        expectText(result, 'Analysis: ready');
        expectText(result, 'Manual fields: none');
        expectText(result, 'Tags: a, b, c, d, e, f');
      },
    },
    {
      action: 'set-field',
      params: (ctx) => ({ action: 'set-field', itemId: itemId(ctx), field: 'tags', value: ['probe-tag', 'edited'] }),
      async expect(result, ctx) {
        expectText(result, 'Queued an override for `tags`.');
        await pollText(ctx, 'the tags override', TOOL, { action: 'get', itemId: itemId(ctx) }, (text) =>
          text.includes('Tags: probe-tag, edited') && text.includes('Manual fields: tags'));
      },
    },
    {
      action: 'reset-field',
      params: (ctx) => ({ action: 'reset-field', itemId: itemId(ctx), field: 'tags' }),
      async expect(result, ctx) {
        expectText(result, 'Queued a reset for `tags`; the generated value will show again.');
        await pollText(ctx, 'the generated tags to return', TOOL, { action: 'get', itemId: itemId(ctx) }, (text) =>
          text.includes('Tags: a, b, c, d, e, f') && text.includes('Manual fields: none'));
      },
    },
    {
      action: 'favourite',
      params: (ctx) => ({ action: 'favourite', itemId: itemId(ctx), favourite: true }),
      async expect(result, ctx) {
        expectText(result, 'Added to favourites.');
        await poll(ctx, 'the item to be a favourite', async () =>
          (await search(ctx, saved<string>(ctx, 'fileName'))).items.find((item) => item.id === itemId(ctx))?.favourite === true);
      },
    },
    {
      action: 'create-collection',
      setup: async (ctx) => { ctx.state.collectionName = `Probe collection ${rand()}`; },
      params: (ctx) => ({ action: 'create-collection', name: saved<string>(ctx, 'collectionName') }),
      async expect(result, ctx) {
        const name = saved<string>(ctx, 'collectionName');
        expectText(result, `Queued collection "${name}".`);
        const listed = await collections(ctx, (text) => text.includes(name), 'the new collection');
        ctx.state.collectionId = expectMatch({ ...result, text: listed }, new RegExp(`- ([^ ]+) — ${name} \\(0\\)`))[1];
      },
    },
    {
      action: 'collect',
      params: (ctx) => ({ action: 'collect', itemId: itemId(ctx), collectionId: collectionId(ctx), member: true }),
      async expect(result, ctx) {
        expectText(result, 'Added to the collection.');
        await collections(ctx, (text) => text.includes(`${collectionId(ctx)} — ${saved<string>(ctx, 'collectionName')} (1)`), 'the item to join the collection');
      },
    },
    {
      action: 'collections',
      params: { action: 'collections' },
      expect: (result, ctx) => expectText(result, `- ${collectionId(ctx)} — ${saved<string>(ctx, 'collectionName')} (1)`),
    },
    {
      action: 'rename-collection',
      setup: async (ctx) => { ctx.state.renamed = `Probe renamed ${rand()}`; },
      params: (ctx) => ({ action: 'rename-collection', collectionId: collectionId(ctx), name: saved<string>(ctx, 'renamed') }),
      async expect(result, ctx) {
        expectText(result, 'Queued the rename.');
        await collections(ctx, (text) => text.includes(`${collectionId(ctx)} — ${saved<string>(ctx, 'renamed')} (1)`), 'the new collection name');
      },
    },
    {
      action: 'delete-collection',
      params: (ctx) => ({ action: 'delete-collection', collectionId: collectionId(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Queued deletion of the collection. The references inside it are untouched.');
        await collections(ctx, (text) => !text.includes(collectionId(ctx)), 'the collection to be gone');
        // The grouping goes; the item stays, no longer in it.
        const kept = (await search(ctx, saved<string>(ctx, 'fileName'))).items.find((item) => item.id === itemId(ctx));
        if (!kept || kept.collectionIds.includes(collectionId(ctx))) throw new Error(`the item did not survive the collection: ${JSON.stringify(kept)}`);
      },
    },
    {
      action: 'delete',
      params: (ctx) => ({ action: 'delete', itemId: itemId(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Moved to Trash.');
        await pollText(ctx, 'the item to leave the search', TOOL, { action: 'search', query: saved<string>(ctx, 'fileName') }, (text) => text === 'No references matched.');
      },
    },
    {
      action: 'restore',
      params: (ctx) => ({ action: 'restore', itemId: itemId(ctx) }),
      async expect(result, ctx) {
        expectText(result, 'Restored.');
        await poll(ctx, 'the item to return to the search', async () => (await search(ctx, saved<string>(ctx, 'fileName'))).items.some((item) => item.id === itemId(ctx)));
      },
    },
    {
      action: 'purge',
      params: (ctx) => ({ action: 'purge', itemId: saved<string>(ctx, 'purgeId') }),
      async expect(result, ctx) {
        expectText(result, 'Queued permanent deletion. Anything referencing it keeps a tombstone, not the image.');
        const purgeId = saved<string>(ctx, 'purgeId');
        await pollText(ctx, 'the item to be gone', TOOL, { action: 'get', itemId: purgeId }, (text) => text === `No Library item ${purgeId}.`);
        // What stays is the tombstone, not the item's folder.
        const home = await libraryHome(ctx);
        if (!fs.existsSync(path.join(home, 'tombstones', `${purgeId}.json`))) throw new Error('no tombstone was left for the purged item');
        if (fs.existsSync(path.join(home, 'items', purgeId))) throw new Error('the purged item folder is still on disk');
        // The kept item is still readable.
        expectText({ ...result, text: await itemText(ctx, itemId(ctx)) }, `(${itemId(ctx)})`);
        removeModelStub(ctx);
      },
    },
  ],
};
