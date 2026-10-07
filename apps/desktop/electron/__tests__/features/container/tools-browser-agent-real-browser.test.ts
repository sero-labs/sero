/**
 * The automation browser against a real page that never returns.
 *
 * Runs Sero's browser tool with the real `agent-browser` and Chromium from the
 * installed browser pack, so it is skipped on a machine without one. Point
 * `SERO_BROWSER_PACK` at the pack's `browser` folder to run it.
 */

import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { createAgentBrowser } from '@electron/features/container/tools/tools-browser-agent';
import type { BrowserRuntimeAdapter } from '@electron/features/workspace/runtime/browser-pack/types';
import { HostBackend } from '@electron/features/workspace/runtime/backends/host/host-backend';
import type { RuntimeBackend } from '@electron/features/workspace/runtime/types';

const PACK = process.env.SERO_BROWSER_PACK ?? '';
const CHROME = path.join(PACK, 'chromium-1234', 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
const available = PACK !== '' && existsSync(path.join(PACK, 'agent-browser', 'bin', 'agent-browser')) && existsSync(CHROME);

/** A shell exec that reports a time limit the way Sero's host backend does. */
const runtime = {
  backend: 'host',
  exec: (input: { command: string; timeoutMs?: number }) => new Promise((resolve) => {
    const limit = input.timeoutMs ?? 120_000;
    exec(input.command, { timeout: limit, killSignal: 'SIGKILL' }, (error, stdout, stderr) => {
      if (!error) return resolve({ stdout, stderr, exitCode: 0 });
      resolve(error.killed
        ? { stdout, stderr: `Command timed out after ${Math.round(limit / 1000)}s. ${stderr}`.trim(), exitCode: 124 }
        : { stdout, stderr: stderr || error.message, exitCode: typeof error.code === 'number' ? error.code : 1 });
    });
  }),
} as unknown as RuntimeBackend;

const adapter: BrowserRuntimeAdapter = {
  browsersPath: PACK,
  chromiumExecutableCandidates: [CHROME],
  ffmpegCandidates: [],
  agentBrowserCandidates: [path.join(PACK, 'agent-browser', 'bin', 'agent-browser')],
  pathPrefixes: [path.join(PACK, 'agent-browser', 'bin'), path.join(PACK, 'ffmpeg-1011')],
  tempDir: path.join(PACK, 'tmp'),
  env: { PLAYWRIGHT_BROWSERS_PATH: PACK },
};

describe.skipIf(!available)('the automation browser on a page stuck in an endless loop', () => {
  const tool = createAgentBrowser(runtime, `hungpage${process.pid}`, async () => ({ adapter, executablePath: CHROME }));
  const run = (params: Record<string, unknown>) => tool.execute('tc', params as never, undefined, undefined, undefined as never);
  const text = (result: Awaited<ReturnType<typeof run>>) => (result.content[0] as { text: string }).text;

  afterAll(async () => { await run({ action: 'close' }).catch(() => undefined); });

  it('resets itself, says why, and works again on the next launch', async () => {
    const page = 'data:text/html,<title>loop</title><button id="b" onclick="while(true){}">go</button>';
    await run({ action: 'launch', url: page });
    expect(text(await run({ action: 'evaluate', expression: '1 + 1' }))).toContain('2');

    // The page's own click handler never returns.
    const startedAt = Date.now();
    await expect(run({ action: 'click', selector: '#b' })).rejects.toThrow(/gave no answer[\s\S]*was reset/);
    const waited = Date.now() - startedAt;

    // Without the reset this launch hangs too: measured on the same stuck page.
    await run({ action: 'launch', url: 'data:text/html,<title>fresh</title>ok' });
    expect(text(await run({ action: 'evaluate', expression: 'document.title' }))).toContain('fresh');
    console.log(`[hung-page] the stuck click was given up after ${Math.round(waited / 1000)}s; the next launch worked`);
  }, 240_000);
});

describe.skipIf(!available)('the automation browser in a real host workspace', () => {
  it('returns a screenshot and saves a recording, both inside the workspace', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'sero-shot-'));
    const backend = new HostBackend({ workspaceId: `shot${process.pid}`, hostWorkspacePath: workspace });
    const tool = createAgentBrowser(backend, `shot${process.pid}`, async () => ({ adapter, executablePath: CHROME }));
    const run = (params: Record<string, unknown>) => tool.execute('tc', params as never, undefined, undefined, undefined as never);
    try {
      await run({ action: 'launch', url: 'data:text/html,<title>shot</title><h1>hello</h1>' });
      const shot = await run({ action: 'screenshot' });

      const image = shot.content.find((block) => block.type === 'image') as { data: string } | undefined;
      // A PNG starts with these bytes, whatever the page shows.
      expect(Buffer.from(image?.data ?? '', 'base64').subarray(1, 4).toString()).toBe('PNG');

      // A recording is written by the browser itself, so it needs the workspace's real path.
      await run({ action: 'start_recording' });
      await run({ action: 'press_key', key: 'a' });
      await run({ action: 'stop_recording' });
      expect(existsSync(path.join(workspace, 'agent-browser-recording.webm'))).toBe(true);
    } finally {
      await run({ action: 'close' }).catch(() => undefined);
      await rm(workspace, { recursive: true, force: true });
    }
  }, 120_000);
});
