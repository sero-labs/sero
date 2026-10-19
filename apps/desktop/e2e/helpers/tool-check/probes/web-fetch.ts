import type { ScenarioStep, StepContext, ToolProbe } from '../types';
import { expectText } from '../expect';
import { waitForWebState, type WebStateEntry } from './web-state';

/** Pages in `fixtures/tool-check-pages`, each with a marker word in its text. */
const ARTICLE = { path: '/web-article.html', title: 'Tool check web article', marker: 'TCWEBARTICLEMARKER' };
const NOTES = { path: '/web-notes.html', title: 'Tool check web notes', marker: 'TCWEBNOTESMARKER' };

const urlOf = (ctx: StepContext, page: { path: string }) => `${ctx.fixtures.pageServerUrl}${page.path}`;

/** The newest history entry that holds exactly these pages, in this order. */
function entryFor(entries: WebStateEntry[], urls: string[]): WebStateEntry | undefined {
  return entries.find((entry) => entry.type === 'fetch'
    && entry.urls?.length === urls.length
    && urls.every((url, index) => entry.urls?.[index]?.url === url));
}

export const fetchContentProbe: ToolProbe = {
  tool: 'fetch_content',
  steps: [
    {
      action: null,
      params: (ctx) => ({ url: urlOf(ctx, ARTICLE) }),
      async expect(result, ctx) {
        // The text can only come from the page the local server served.
        expectText(result, ARTICLE.marker);
        const url = urlOf(ctx, ARTICLE);
        const state = await waitForWebState(ctx, `a fetch of ${url}`, (s) => entryFor(s.entries, [url]) !== undefined);
        const entry = entryFor(state.entries, [url])!;
        if (!(entry.urls![0]!.charCount > 500) || entry.urls![0]!.error) throw new Error(`history holds a bad fetch: ${JSON.stringify(entry)}`);
      },
    },
    {
      action: null,
      params: (ctx) => ({ urls: [urlOf(ctx, ARTICLE), urlOf(ctx, NOTES)] }),
      async expect(result, ctx) {
        // Several URLs return a list and a responseId; the content itself is stored.
        expectText(result, '## Fetched URLs');
        for (const page of [ARTICLE, NOTES]) {
          const line = new RegExp(`- ${page.title} \\((\\d+) chars\\)`).exec(result.text);
          if (!line || Number(line[1]) <= 500) throw new Error(`no fetched line for ${page.title}: ${result.text}`);
        }
        const responseId = /responseId: "([^"]+)"/.exec(result.text)?.[1];
        if (!responseId) throw new Error(`no responseId in: ${result.text}`);
        const urls = [urlOf(ctx, ARTICLE), urlOf(ctx, NOTES)];
        const state = await waitForWebState(ctx, `the two-page fetch ${responseId}`, (s) => entryFor(s.entries, urls)?.id === responseId);
        if (!state.entries.some((entry) => entry.id === responseId)) throw new Error('history lost the fetch');
      },
    },
  ],
};

/** The entry the two-page fetch_content step left in this workspace's history. */
async function storedFetch(ctx: StepContext): Promise<WebStateEntry> {
  const urls = [urlOf(ctx, ARTICLE), urlOf(ctx, NOTES)];
  const state = await waitForWebState(
    ctx,
    'the two-page fetch_content result; the fetch_content probe must run first (SERO_TOOL_CHECK_ONLY=fetch_content,get_search_content)',
    (s) => entryFor(s.entries, urls) !== undefined,
    3_000,
  );
  return entryFor(state.entries, urls)!;
}

const readsStored = (page: typeof ARTICLE, other: typeof ARTICLE): ScenarioStep['expect'] => (result) => {
  expectText(result, `# ${page.title}`);
  expectText(result, page.marker);
  if (result.text.includes(other.marker)) throw new Error(`the result holds the other page's text: ${result.text}`);
};

export const getSearchContentProbe: ToolProbe = {
  tool: 'get_search_content',
  // The stored fetch lives in the plugin's in-memory result store, which a fetch_content call in an earlier chat of
  // this workspace filled. The id is read from the history the plugin wrote for that call.
  steps: [
    {
      action: null,
      setup: async (ctx) => { ctx.state.stored = await storedFetch(ctx); },
      params: (ctx) => ({ responseId: (ctx.state.stored as WebStateEntry).id, urlIndex: 1 }),
      expect: readsStored(NOTES, ARTICLE),
    },
    {
      action: null,
      params: (ctx) => ({ responseId: (ctx.state.stored as WebStateEntry).id, url: urlOf(ctx, ARTICLE) }),
      expect: readsStored(ARTICLE, NOTES),
    },
  ],
};
