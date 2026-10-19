import type { StepContext, ToolProbe } from '../types';
import { expectText } from '../expect';
import { readWebState, waitForWebState, writeWebEntries } from './web-state';

const TITLE = 'tc-web-bookmark page';
const DESCRIPTION = 'tc-web-bookmark description';
const TAGS = ['tc-web-bookmark', 'tc-web-extra'];

const bookmarkUrl = (ctx: StepContext) => `${ctx.fixtures.pageServerUrl}/web-article.html#tc-web-bookmark`;

export const webBookmarkProbe: ToolProbe = {
  tool: 'web_bookmark',
  steps: [
    {
      action: 'add',
      params: (ctx) => ({ action: 'add', url: bookmarkUrl(ctx), title: TITLE, description: DESCRIPTION, tags: TAGS }),
      async expect(result, ctx) {
        expectText(result, `Bookmarked: ${TITLE}\n${bookmarkUrl(ctx)}\nTags: ${TAGS.join(', ')}`);
        const saved = (await readWebState(ctx)).bookmarks.find((bookmark) => bookmark.url === bookmarkUrl(ctx));
        if (!saved) throw new Error('the bookmark is not in the state file');
        if (saved.title !== TITLE || saved.description !== DESCRIPTION || saved.tags.join() !== TAGS.join()) {
          throw new Error(`the saved bookmark is wrong: ${JSON.stringify(saved)}`);
        }
        ctx.state.bookmarkId = saved.id;
      },
    },
    {
      action: 'list',
      params: { action: 'list', tag: TAGS[0] },
      expect(result, ctx) {
        expectText(result, `**${TITLE}**\n   ${bookmarkUrl(ctx)}\n   ${DESCRIPTION}\n   Tags: ${TAGS.join(', ')}`);
      },
    },
    {
      // A tag no bookmark has: the filter hides the one that exists.
      action: 'list',
      params: { action: 'list', tag: 'tc-web-no-such-tag' },
      expect: (result) => expectText(result, 'No bookmarks with tag "tc-web-no-such-tag".'),
    },
    {
      action: 'remove',
      params: (ctx) => ({ action: 'remove', id: String(ctx.state.bookmarkId) }),
      async expect(result, ctx) {
        expectText(result, `Removed bookmark: ${String(ctx.state.bookmarkId)}`);
        if ((await readWebState(ctx)).bookmarks.some((bookmark) => bookmark.id === ctx.state.bookmarkId)) {
          throw new Error('the bookmark is still in the state file');
        }
      },
    },
    {
      // After the remove, the tag that matched before matches nothing.
      action: 'list',
      params: { action: 'list', tag: TAGS[0] },
      expect: (result) => expectText(result, `No bookmarks with tag "${TAGS[0]}".`),
    },
    {
      action: 'clear_history',
      // The fetch_content probe leaves history behind. A run of this tool alone has none, so one is seeded.
      async setup(ctx) {
        const before = await readWebState(ctx);
        if (before.entries.length === 0) {
          await writeWebEntries(ctx, [{
            id: 'tc-web-bookmark-history', type: 'fetch', timestamp: Date.now(),
            urls: [{ url: bookmarkUrl(ctx), title: TITLE, charCount: 1, error: null }],
          }]);
        }
        ctx.state.clearStartedAt = Date.now();
      },
      params: { action: 'clear_history' },
      async expect(result, ctx) {
        expectText(result, 'Search history cleared.');
        const state = await waitForWebState(ctx, 'cleared history', (s) => s.entries.length === 0);
        if (state.historyClearedAt < Number(ctx.state.clearStartedAt)) throw new Error(`historyClearedAt was not set: ${state.historyClearedAt}`);
      },
    },
  ],
};
