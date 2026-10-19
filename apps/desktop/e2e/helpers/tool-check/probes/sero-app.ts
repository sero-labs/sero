import fs from 'node:fs';
import type { StepContext, ToolCallResult, ToolProbe } from '../types';
import { expectImage, expectOk, expectText } from '../expect';
import { pageOf, putFile } from '../files';

const FILES = 60;
const LAST = `file-${FILES - 1}.txt`;
const EDITOR_TEXT = '.monaco-editor .view-lines';
// A standard input: the URL field of the preview the step before opened.
const ADDRESS = 'input[aria-label="Preview URL"]';
const item = (name: string) => `[data-testid="file-tree-item-${name.replace(/\./g, '\\.')}"]`;

/** Monaco draws spaces as no-break spaces. */
const editorText = (result: ToolCallResult): ToolCallResult => ({ ...result, text: result.text.replace(/\u00a0/g, ' ') });

/** The scrollable file tree, from a `scroll-containers` result. */
function treeContainer(result: ToolCallResult, ctx: StepContext): void {
  expectOk(result);
  const containers = JSON.parse(result.text) as Array<{ selectorHint: string | null; ref: string; maxScrollTop: number }>;
  const tree = containers.find((container) => container.maxScrollTop > 100);
  if (!tree) throw new Error(`no container scrolls: ${result.text}`);
  ctx.state.tree = tree.selectorHint ?? tree.ref;
}

/** Fails unless the element matches `state` (`:focus` or `:hover`) in the app window. */
async function expectElementState(ctx: StepContext, selector: string, state: ':focus' | ':hover'): Promise<void> {
  const matches = await pageOf(ctx).evaluate(({ selector: sel, state: pseudo }) => document.querySelector(sel)?.matches(pseudo) ?? null, { selector, state });
  if (matches !== true) throw new Error(`${selector} is not ${state} (${String(matches)})`);
}

export const seroAppProbe: ToolProbe = {
  tool: 'sero app',
  steps: [
    { action: 'list', params: { argv: ['list'] }, expect: (result) => expectText(result, 'explorer         Explorer') },
    { action: 'info', params: { argv: ['info', 'explorer'] }, expect: (result) => expectText(result, '"explorer"') },
    { action: 'open', params: { argv: ['open', 'Dashboard'] }, expect: (result) => expectText(result, 'Switched to app: Dashboard (dashboard)') },
    { action: 'active', params: { argv: ['active'] }, expect: (result) => expectText(result, 'Active app: dashboard') },
    {
      action: 'open',
      setup: async (ctx) => {
        for (let i = 0; i < FILES; i++) await putFile(ctx, `tc-app/file-${i}.txt`, `tool check file ${i}\n`);
      },
      params: { argv: ['open', 'explorer'] },
      expect: (result) => expectText(result, 'Switched to app: Explorer (explorer)'),
    },
    { action: 'active', params: { argv: ['active'] }, expect: (result) => expectText(result, 'Active app: explorer') },
    { action: 'screenshot', params: { argv: ['screenshot'] }, expect: (result) => expectImage(result) },
    // Possibly brittle: in one full run the folder was not in the tree. It passes on its own; the cause is not known.
    { action: 'click', params: { argv: ['click', item('tc-app')] }, expect: (result) => expectText(result, 'Clicked: ') },
    // The click opened the folder.
    { action: 'visible', params: { argv: ['visible', '--text', 'file-0.txt'] }, expect: (result) => expectText(result, 'Visible: file-0.txt') },
    { action: 'scroll-containers', params: { argv: ['scroll-containers'] }, expect: treeContainer },
    {
      action: 'scroll',
      params: (ctx) => ({ argv: ['scroll', '--selector', String(ctx.state.tree), '--y', '300'] }),
      expect(result) {
        expectText(result, 'Scrolled ');
        const [, before, after] = /scrollTop (\d+) → (\d+)/.exec(result.text) ?? [];
        if (!(Number(after) > Number(before))) throw new Error(`the tree did not move: ${result.text}`);
      },
    },
    { action: 'scroll-to', params: { argv: ['scroll-to', '--text', LAST] }, expect: (result) => expectText(result, 'visible: true') },
    { action: 'visible', params: { argv: ['visible', '--text', LAST] }, expect: (result) => expectText(result, `Visible: ${LAST}`) },
    { action: 'screenshot-around', params: { argv: ['screenshot-around', '--text', LAST] }, expect: (result) => expectImage(result) },
    { action: 'inspect', params: { argv: ['inspect', item(LAST)] }, expect: (result) => expectText(result, LAST) },
    {
      action: 'select',
      params: { argv: ['select', item(LAST)] },
      async expect(result, ctx) {
        expectText(result, 'Selected: ');
        await expectElementState(ctx, item(LAST), ':focus');
      },
    },
    { action: 'click', params: { argv: ['click', item('file-0.txt')] }, expect: (result) => expectText(result, 'Clicked: ') },
    {
      action: 'get-text',
      // Monaco loads after the click; a user waits for the file to show.
      setup: (ctx) => pageOf(ctx).locator(EDITOR_TEXT, { hasText: 'tool check file 0' }).waitFor({ timeout: 15_000 }),
      params: { argv: ['get-text', EDITOR_TEXT] },
      expect: (result) => expectText(editorText(result), 'tool check file 0'),
    },
    { action: 'snapshot', params: { argv: ['snapshot'] }, expect: (result) => expectText(result, '"panelRect"') },
    { action: 'record', params: { argv: ['record', 'start'] }, expect: (result) => expectText(result, 'Recording started') },
    { action: 'record', params: { argv: ['record', 'status'] }, expect: (result) => expectText(result, 'Recording in progress') },
    {
      action: 'record',
      params: { argv: ['record', 'stop'] },
      timeoutMs: 60_000,
      expect(result) {
        expectText(result, 'Recording saved: ');
        const saved = /Recording saved: (.+?) \(/.exec(result.text)?.[1];
        if (!saved || !fs.existsSync(saved) || fs.statSync(saved).size === 0) throw new Error(`no recording on disk: ${result.text}`);
      },
    },
    {
      action: 'preview',
      params: (ctx) => ({ argv: ['preview', `${ctx.fixtures.pageServerUrl}/`, '--headless'] }),
      timeoutMs: 60_000,
      expect: (result) => expectImage(result),
    },
    {
      action: 'preview',
      params: (ctx) => ({ argv: ['preview', `${ctx.fixtures.pageServerUrl}/`] }),
      async expect(result, ctx) {
        expectText(result, 'Dev server preview opened in editor');
        // Explorer's editor shows the page in an iframe.
        await pageOf(ctx).locator(`iframe[src^="${ctx.fixtures.pageServerUrl}"]`).waitFor({ timeout: 10_000 });
      },
    },
    {
      action: 'type',
      setup: (ctx) => pageOf(ctx).locator(ADDRESS).waitFor({ timeout: 10_000 }),
      params: { argv: ['type', 'tc-typed-address', '--selector', ADDRESS] },
      async expect(result, ctx) {
        expectText(result, 'Typed "tc-typed-address"');
        const value = await pageOf(ctx).locator(ADDRESS).inputValue();
        if (!value.includes('tc-typed-address')) throw new Error(`the address bar holds ${JSON.stringify(value)}`);
      },
    },
    {
      action: 'hover',
      params: { argv: ['hover', item(LAST)] },
      async expect(result, ctx) {
        expectText(result, 'Hovered: ');
        await expectElementState(ctx, item(LAST), ':hover');
      },
    },
    // Monaco types through an EditContext, which only real text input reaches.
    { action: 'click', params: { argv: ['click', item('file-0.txt')] }, expect: (result) => expectText(result, 'Clicked: ') },
    {
      action: 'type',
      setup: (ctx) => pageOf(ctx).locator(EDITOR_TEXT, { hasText: 'tool check file 0' }).waitFor({ timeout: 15_000 }),
      params: { argv: ['type', 'tc typed text', '--selector', '.monaco-editor .native-edit-context'] },
      async expect(result, ctx) {
        expectText(result, 'Typed "tc typed text"');
        const shown = await pageOf(ctx).locator(EDITOR_TEXT).innerText();
        if (!shown.replace(/\u00a0/g, ' ').includes('tc typed text')) throw new Error(`the editor did not change: ${JSON.stringify(shown)}`);
      },
    },
  ],
};
