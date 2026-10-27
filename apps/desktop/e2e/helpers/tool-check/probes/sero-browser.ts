import type { ToolProbe } from '../types';
import { expectImage, expectText } from '../expect';

/** The tab id a `browser open` result names. */
function openedTab(text: string): string {
  const id = /Opened tab (\S+)/.exec(text)?.[1];
  if (!id) throw new Error(`no tab id in: ${text}`);
  return id;
}

export const seroBrowserProbe: ToolProbe = {
  tool: 'sero browser',
  steps: [
    {
      action: 'open',
      params: (ctx) => ({ argv: ['open', `${ctx.fixtures.pageServerUrl}/`] }),
      expect(result, ctx) {
        expectText(result, 'Opened tab');
        ctx.state.tab = openedTab(result.text);
      },
    },
    { action: 'list', params: { argv: ['list'] }, expect: (result, ctx) => expectText(result, String(ctx.state.tab)) },
    {
      action: 'get-text',
      params: (ctx) => ({ argv: ['get-text', '--tab', String(ctx.state.tab)] }),
      expect: (result) => expectText(result, 'The quick brown fox jumps over the lazy dog.'),
    },
    { action: 'show', params: { argv: ['show'] }, expect: (result) => expectText(result, 'Browser panel shown') },
    {
      action: 'screenshot',
      params: (ctx) => ({ argv: ['screenshot', '--tab', String(ctx.state.tab)] }),
      expect: (result) => expectImage(result),
    },
    {
      action: 'scroll',
      params: (ctx) => ({ argv: ['scroll', '--tab', String(ctx.state.tab), '--amount', '600'] }),
      expect(result) {
        expectText(result, 'Scrolled down by 600px');
        const y = Number(/y=(\d+)/.exec(result.text)?.[1]);
        if (!(y > 0)) throw new Error(`the page did not move: ${result.text}`);
      },
    },
    {
      action: 'navigate',
      params: (ctx) => ({ argv: ['navigate', String(ctx.state.tab), `${ctx.fixtures.pageServerUrl}/stuck.html`] }),
      expect: (result, ctx) => expectText(result, `Navigating tab ${String(ctx.state.tab)}`),
    },
    {
      // The tab now shows the new page.
      action: 'list',
      params: { argv: ['list'] },
      expect: (result) => expectText(result, '/stuck.html'),
    },
    {
      action: 'goto',
      params: (ctx) => ({ argv: ['goto', `${ctx.fixtures.pageServerUrl}/?goto=1`] }),
      expect: (result) => expectText(result, '?goto=1'),
    },
    {
      action: 'get-text',
      params: (ctx) => ({ argv: ['get-text', '--tab', String(ctx.state.tab)] }),
      expect: (result) => expectText(result, '?goto=1'),
    },
    {
      action: 'close',
      params: (ctx) => ({ argv: ['close', String(ctx.state.tab)] }),
      expect: (result, ctx) => expectText(result, `Closed tab ${String(ctx.state.tab)}`),
    },
    {
      action: 'list',
      params: { argv: ['list'] },
      expect(result, ctx) {
        if (result.text.includes(String(ctx.state.tab))) throw new Error(`the closed tab is still listed: ${result.text}`);
      },
    },
  ],
};
