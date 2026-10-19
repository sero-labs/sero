import fs from 'node:fs';
import path from 'node:path';
import type { ToolProbe } from '../types';
import { expectError, expectImage, expectOk, expectText } from '../expect';

const page = (url: string) => `${url}/`;

/**
 * The hidden automation browser on the local test pages. It also carries the
 * checks that were in tools-browser-agent-real-browser.test.ts: a page that
 * never answers resets the browser, a loaded page does not cost the full wait,
 * and the screenshot and recording come back from the real browser.
 */
export const automationBrowserProbe: ToolProbe = {
  tool: 'automation_browser',
  // The first launch may install the browser pack, and the stuck click waits out its limit.
  timeoutMs: 600_000,
  steps: [
    { action: 'launch', params: (ctx) => ({ action: 'launch', url: page(ctx.fixtures.pageServerUrl) }), timeoutMs: 540_000, expect: (result) => expectText(result, 'Automation browser title: Tool check page') },
    { action: 'get_text', params: { action: 'get_text', selector: '#body-text' }, expect: (result) => expectText(result, 'The quick brown fox jumps over the lazy dog.') },
    { action: 'evaluate', params: { action: 'evaluate', expression: 'document.title' }, expect: (result) => expectText(result, 'Tool check page') },
    { action: 'type', params: { action: 'type', selector: '#name', text: 'Probe' }, expect: (result) => expectText(result, 'Probe') },
    { action: 'press_key', params: { action: 'press_key', key: 'x' }, expect: expectOk },
    { action: 'click', params: { action: 'click', selector: '#greet' }, expect: expectOk },
    {
      // The typed text, the key and the click all reached the page.
      action: 'evaluate',
      params: { action: 'evaluate', expression: "document.getElementById('greeting').textContent" },
      expect: (result) => expectText(result, 'Hello, Probex'),
    },
    { action: 'scroll', params: { action: 'scroll', direction: 'down', amount: 2000 }, expect: expectOk },
    { action: 'evaluate', params: { action: 'evaluate', expression: 'String(window.scrollY > 0)' }, expect: (result) => expectText(result, 'true') },
    {
      action: 'evaluate',
      params: { action: 'evaluate', expression: "setTimeout(() => { const late = document.createElement('p'); late.id = 'late'; late.textContent = 'late'; document.body.prepend(late); }, 1500), 'scheduled'" },
      expect: (result) => expectText(result, 'scheduled'),
    },
    {
      // The element appears 1.5 s after the step before: the wait has to last that long.
      action: 'wait',
      setup: async (ctx) => { ctx.state.waitFrom = Date.now(); },
      params: { action: 'wait', selector: '#late', timeout: 10_000 },
      expect(result, ctx) {
        expectOk(result);
        const waited = Date.now() - Number(ctx.state.waitFrom);
        if (waited < 1_000) throw new Error(`the wait returned after ${waited} ms, before #late existed`);
      },
    },
    { action: 'snapshot', params: { action: 'snapshot' }, expect: (result) => expectText(result, 'Greet') },
    { action: 'screenshot', params: { action: 'screenshot' }, expect: (result) => expectImage(result) },
    { action: 'start_recording', params: { action: 'start_recording' }, expect: (result) => expectText(result, 'Recording started: ') },
    { action: 'press_key', params: { action: 'press_key', key: 'a' }, expect: expectOk },
    {
      action: 'stop_recording',
      params: { action: 'stop_recording' },
      expect(result, ctx) {
        expectText(result, 'Automation browser recording stopped.');
        // The browser writes the file itself, so it lands in the workspace's real folder.
        const saved = path.join(ctx.workspacePath, 'agent-browser-recording.webm');
        if (!fs.existsSync(saved) || fs.statSync(saved).size === 0) throw new Error(`no recording at ${saved}: ${result.text}`);
      },
    },
    { action: 'navigate', params: (ctx) => ({ action: 'navigate', url: `${ctx.fixtures.pageServerUrl}/stuck.html` }), expect: (result) => expectText(result, 'Automation browser title: Stuck page') },
    {
      // The page's own click handler never returns: the tool must give up, reset and say so.
      action: 'click',
      params: { action: 'click', selector: '#hang' },
      timeoutMs: 150_000,
      expect: (result) => expectError(result, 'was reset'),
    },
    {
      // After the reset, a launch works, and waiting for a page that has loaded does not cost the full limit.
      action: 'launch',
      params: (ctx) => ({ action: 'launch', url: page(ctx.fixtures.pageServerUrl), wait_until: 'load' }),
      timeoutMs: 10_000,
      expect: (result) => expectText(result, 'Automation browser title: Tool check page'),
    },
    { action: 'evaluate', params: { action: 'evaluate', expression: 'document.title' }, expect: (result) => expectText(result, 'Tool check page') },
    { action: 'close', params: { action: 'close' }, expect: (result) => expectText(result, 'Automation browser closed.') },
  ],
};
