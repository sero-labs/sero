import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeBackend } from '@electron/features/workspace/runtime/types';

type ExecResult = { stdout: string; stderr: string; exitCode: number };

const BROWSER_PATH = '/root/.cache/ms-playwright/chromium-1200/chrome-linux/chrome';
const DOCKER_CACHE_BROWSER_PATH = '/tmp/sero-home/.cache/ms-playwright/chromium-1200/chrome-linux/chrome';
const APPLE_BROWSER_PATH = '/ms-playwright/chromium-1200/chrome-linux/chrome';
const MISMATCHED_BROWSER_PATH = '/root/.cache/ms-playwright/chromium-1208/chrome-linux/chrome';
const browserPathResult: ExecResult = { stdout: `${BROWSER_PATH}\n`, stderr: '', exitCode: 0 };
const mismatchedBrowserPathResult: ExecResult = { stdout: `${MISMATCHED_BROWSER_PATH}\n`, stderr: '', exitCode: 0 };
const viewportResult: ExecResult = {
  stdout: '{"result":{"width":1280,"height":720,"scrollX":0,"scrollY":0}}',
  stderr: '',
  exitCode: 0,
};
const ffmpegCacheResult: ExecResult = { stdout: '', stderr: '', exitCode: 0 };

function createExecMock(results: ExecResult[]) {
  const exec = vi.fn();
  for (const result of results) {
    exec.mockResolvedValueOnce(result);
  }
  return exec;
}

async function createToolWithExec(results: ExecResult[]) {
  vi.resetModules();
  const exec = createExecMock(results);
  const { createAgentBrowser } = await import('@electron/features/container/tools/tools-browser-agent');
  const runtime = {
    backend: 'docker',
    exec: (input: { command: string; cwd?: string; timeoutMs?: number }) => exec('ws-1', input.command, input.cwd, input.timeoutMs),
    createDirectory: (input: { path: string }) => exec('ws-1', `mkdir -p '${input.path}'`, undefined, undefined),
  } as unknown as RuntimeBackend;
  const tool = createAgentBrowser(runtime, 'ws-1');
  return { tool, exec };
}

describe('createAgentBrowser', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('auto-installs agent-browser when the CLI is missing', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '', stderr: '', exitCode: 1 },
      { stdout: 'installed\n', stderr: '', exitCode: 0 },
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      browserPathResult,
      { stdout: '{"message":"opened"}', stderr: '', exitCode: 0 },
    ]);

    await tool.execute('tc-install', { action: 'launch' }, undefined, undefined, undefined as never);

    expect(exec.mock.calls[1][1]).toContain('npm install -g agent-browser');
    expect(exec.mock.calls[4][1]).toContain("'--executable-path' '/root/.cache/ms-playwright/chromium-1200/chrome-linux/chrome'");
    expect(exec.mock.calls[4][1]).toContain("'open' 'about:blank'");
  });

  it('closes without forcing a matching Playwright browser install', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '{}', stderr: '', exitCode: 0 },
    ]);

    await tool.execute('tc-close', { action: 'close' }, undefined, undefined, undefined as never);

    expect(exec).toHaveBeenCalledTimes(2);
    expect(exec.mock.calls[1][1]).toContain("'close' '--json'");
  });

  it('resets the browser session after launch navigation failures instead of poisoning later actions', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      browserPathResult,
      { stdout: '{"success":false,"error":"CDP command timed out: Page.navigate"}', stderr: '', exitCode: 1 },
      { stdout: '{"success":true,"data":{"closed":true}}', stderr: '', exitCode: 0 },
      { stdout: '{"success":true,"data":{"url":"about:blank"}}', stderr: '', exitCode: 0 },
    ]);

    const result = await tool.execute('tc-launch-timeout', { action: 'launch', url: 'https://example.com' }, undefined, undefined, undefined as never);

    expect(exec.mock.calls[2][1]).toContain("'open' 'https://example.com'");
    expect(exec.mock.calls[3][1]).toContain("'close' '--json'");
    expect(exec.mock.calls[4][1]).toContain("'open' 'about:blank'");
    expect((result.content[0] as { text: string }).text).toContain('Navigation to https://example.com failed');
  });

  it('resets the browser session after navigate failures instead of poisoning later actions', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '{"success":false,"error":"Navigation failed: net::ERR_BLOCKED_BY_CLIENT"}', stderr: '', exitCode: 1 },
      { stdout: '{"success":true,"data":{"closed":true}}', stderr: '', exitCode: 0 },
      { stdout: '{"success":true,"data":{"url":"about:blank"}}', stderr: '', exitCode: 0 },
    ]);

    const result = await tool.execute('tc-navigate-timeout', { action: 'navigate', url: 'https://example.com' }, undefined, undefined, undefined as never);

    expect(exec.mock.calls[1][1]).toContain("'open' 'https://example.com'");
    expect(exec.mock.calls[2][1]).toContain("'close' '--json'");
    expect(exec.mock.calls[3][1]).toContain("'open' 'about:blank'");
    expect((result.content[0] as { text: string }).text).toContain('Navigation to https://example.com failed');
  });

  it('creates the recording directory before record start', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      browserPathResult,
      ffmpegCacheResult,
      { stdout: '', stderr: '', exitCode: 0 },
      { stdout: '{"message":"recording"}', stderr: '', exitCode: 0 },
    ]);

    const result = await tool.execute(
      'tc-1',
      { action: 'start_recording', save_path: '/workspace/browser-e2e/capture.webm' },
      undefined,
      undefined,
      undefined as never,
    );

    expect(result.content[0]).toMatchObject({ type: 'text' });
    expect((result.content[0] as { type: string; text: string }).text).toContain('recording');
    expect(exec.mock.calls[1][1]).toContain('"$PLAYWRIGHT_BROWSERS_PATH"/chromium-1200/chrome-linux/chrome');
    expect(exec.mock.calls[1][1]).toContain('/ms-playwright/chromium-1200/chrome-linux/chrome');
    expect(exec.mock.calls[1][1]).toContain('"$HOME"/.cache/ms-playwright/chromium-1200/chrome-linux/chrome');
    expect(exec.mock.calls[2][1]).toContain('find "$PLAYWRIGHT_BROWSERS_PATH" /ms-playwright "$HOME/.cache/ms-playwright" /root/.cache/ms-playwright');
    expect(exec.mock.calls[2][1]).toContain('ln -sf "$ffmpeg_path" "$HOME/.local/bin/ffmpeg"');
    expect(exec.mock.calls[2][1]).toContain('PATH="$HOME/.local/bin:$PATH"');
    expect(exec.mock.calls[3][1]).toContain("mkdir -p '/workspace/browser-e2e'");
    expect(exec.mock.calls[4][1]).toContain('PATH="$HOME/.local/bin:$PATH"');
    expect(exec.mock.calls[4][1]).toContain("'--executable-path' '/root/.cache/ms-playwright/chromium-1200/chrome-linux/chrome'");
    expect(exec.mock.calls[4][1]).toContain("'record' 'start'");
  });

  it('auto-stops recordings after the 120s safety limit', async () => {
    vi.useFakeTimers();
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      browserPathResult,
      ffmpegCacheResult,
      { stdout: '', stderr: '', exitCode: 0 },
      { stdout: '{"message":"recording"}', stderr: '', exitCode: 0 },
      ffmpegCacheResult,
      { stdout: '{"message":"stopped"}', stderr: '', exitCode: 0 },
    ]);

    const start = await tool.execute(
      'tc-auto-stop-start',
      { action: 'start_recording', save_path: '/workspace/capture.webm' },
      undefined,
      undefined,
      undefined as never,
    );

    expect((start.content[0] as { type: string; text: string }).text).toContain('auto-stop after 120s');
    await vi.advanceTimersByTimeAsync(120_000);

    const stop = await tool.execute('tc-auto-stop-stop', { action: 'stop_recording' }, undefined, undefined, undefined as never);

    expect((stop.content[0] as { type: string; text: string }).text).toContain('already auto-stopped after reaching the 120s limit');
    expect((stop.content[0] as { type: string; text: string }).text).toContain('/workspace/capture.webm');
    expect(exec).toHaveBeenCalledTimes(7);
    expect(exec.mock.calls[6][1]).toContain("'record' 'stop'");
  });

  it('restarts recording when a stale recording is already active', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      browserPathResult,
      ffmpegCacheResult,
      { stdout: '', stderr: '', exitCode: 0 },
      {
        stdout: '{"error":"Recording already in progress. Run \'record stop\' first, or use \'record restart\' to stop and start a new recording."}',
        stderr: '',
        exitCode: 1,
      },
      { stdout: '{"message":"recording restarted"}', stderr: '', exitCode: 0 },
    ]);

    const result = await tool.execute(
      'tc-restart-recording',
      { action: 'start_recording', save_path: '/workspace/capture.webm' },
      undefined,
      undefined,
      undefined as never,
    );

    expect((result.content[0] as { type: string; text: string }).text).toContain('recording restarted');
    expect(exec.mock.calls[4][1]).toContain("'record' 'start'");
    expect(exec.mock.calls[5][1]).toContain("'record' 'restart'");
  });

  it('installs matching Playwright ffmpeg before recording when the cache is missing', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      browserPathResult,
      { stdout: '', stderr: '', exitCode: 1 },
      { stdout: 'installed ffmpeg\n', stderr: '', exitCode: 0 },
      { stdout: '', stderr: '', exitCode: 0 },
      { stdout: '', stderr: '', exitCode: 0 },
      { stdout: '{"message":"recording"}', stderr: '', exitCode: 0 },
    ]);

    await tool.execute(
      'tc-install-ffmpeg',
      { action: 'start_recording', save_path: '/workspace/capture.webm' },
      undefined,
      undefined,
      undefined as never,
    );

    expect(exec.mock.calls[3][1]).toContain('if [ -w /ms-playwright ]; then export PLAYWRIGHT_BROWSERS_PATH=/ms-playwright; else unset PLAYWRIGHT_BROWSERS_PATH; fi');
    expect(exec.mock.calls[3][1]).toContain('playwright@1.57.0 install ffmpeg');
    expect(exec.mock.calls[4][1]).toContain('ln -sf "$ffmpeg_path" "$HOME/.local/bin/ffmpeg"');
    expect(exec.mock.calls[6][1]).toContain("'record' 'start'");
  });

  it('uses a longer timeout for record stop finalization', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      ffmpegCacheResult,
      { stdout: '{"message":"stopped"}', stderr: '', exitCode: 0 },
    ]);

    await tool.execute('tc-stop-recording', { action: 'stop_recording' }, undefined, undefined, undefined as never);

    expect(exec.mock.calls[2][1]).toContain("'record' 'stop'");
    expect(exec.mock.calls[2][3]).toBe(60_000);
  });

  it('does not share cached browser paths across tool/runtime instances', async () => {
    vi.resetModules();
    const dockerExec = createExecMock([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: `${DOCKER_CACHE_BROWSER_PATH}\n`, stderr: '', exitCode: 0 },
      { stdout: '{"message":"opened","url":"about:blank"}', stderr: '', exitCode: 0 },
    ]);
    const appleExec = createExecMock([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: `${APPLE_BROWSER_PATH}\n`, stderr: '', exitCode: 0 },
      { stdout: '{"message":"opened","url":"about:blank"}', stderr: '', exitCode: 0 },
    ]);
    const { createAgentBrowser } = await import('@electron/features/container/tools/tools-browser-agent');
    const dockerTool = createAgentBrowser({ backend: 'docker', exec: (input: { command: string; cwd?: string; timeoutMs?: number }) => dockerExec('ws-1', input.command, input.cwd, input.timeoutMs) } as unknown as RuntimeBackend, 'ws-1');
    const appleTool = createAgentBrowser({ backend: 'apple-container', exec: (input: { command: string; cwd?: string; timeoutMs?: number }) => appleExec('ws-1', input.command, input.cwd, input.timeoutMs) } as unknown as RuntimeBackend, 'ws-1');

    await dockerTool.execute('tc-docker-launch', { action: 'launch' }, undefined, undefined, undefined as never);
    await appleTool.execute('tc-apple-launch', { action: 'launch' }, undefined, undefined, undefined as never);

    expect(dockerExec.mock.calls[2][1]).toContain("'--session' 'sero-ws-1-docker'");
    expect(dockerExec.mock.calls[2][1]).toContain(`'--executable-path' '${DOCKER_CACHE_BROWSER_PATH}'`);
    expect(appleExec.mock.calls[1][1]).toContain('/ms-playwright/chromium-1200/chrome-linux/chrome');
    expect(appleExec.mock.calls[2][1]).toContain("'--session' 'sero-ws-1-apple-container'");
    expect(appleExec.mock.calls[2][1]).toContain(`'--executable-path' '${APPLE_BROWSER_PATH}'`);
    expect(appleExec.mock.calls[2][1]).toContain("'open' 'about:blank'");
  });

  it('supports launch without a url by opening about:blank', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      browserPathResult,
      { stdout: '{"message":"Browser launched","url":"about:blank"}', stderr: '', exitCode: 0 },
    ]);

    const result = await tool.execute('tc-launch', { action: 'launch' }, undefined, undefined, undefined as never);

    expect(exec.mock.calls[2][1]).toContain("'--executable-path' '/root/.cache/ms-playwright/chromium-1200/chrome-linux/chrome'");
    expect(exec.mock.calls[2][1]).toContain("'open' 'about:blank'");
    expect((result.content[0] as { type: string; text: string }).text).toContain('about:blank');
  });

  it('returns snapshot text from nested data payloads', async () => {
    const { tool } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      {
        stdout: '{"success":true,"data":{"snapshot":"- button \"Submit\" [ref=e1]"}}',
        stderr: '',
        exitCode: 0,
      },
    ]);

    const result = await tool.execute('tc-snapshot', { action: 'snapshot' }, undefined, undefined, undefined as never);

    expect((result.content[0] as { type: string; text: string }).text).toContain('[ref=e1]');
  });

  it('uses mouse commands for coordinate clicks', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      viewportResult,
      { stdout: '{"message":"moved"}', stderr: '', exitCode: 0 },
      { stdout: '{"message":"down"}', stderr: '', exitCode: 0 },
      { stdout: '{"message":"up"}', stderr: '', exitCode: 0 },
    ]);

    await tool.execute('tc-click', { action: 'click', x: 10, y: 20 }, undefined, undefined, undefined as never);

    expect(exec.mock.calls[2][1]).toContain("'mouse' 'move' '10' '20'");
    expect(exec.mock.calls[3][1]).toContain("'mouse' 'down' 'left'");
    expect(exec.mock.calls[4][1]).toContain("'mouse' 'up' 'left'");
  });

  it('rejects coordinate clicks outside the current viewport', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      {
        stdout: '{"result":{"width":1280,"height":720,"scrollX":0,"scrollY":1200}}',
        stderr: '',
        exitCode: 0,
      },
    ]);

    await expect(
      tool.execute('tc-click-oob', { action: 'click', x: 194, y: -795 }, undefined, undefined, undefined as never),
    ).rejects.toThrow(/outside the current browser viewport/);

    expect(exec).toHaveBeenCalledTimes(2);
    expect(exec.mock.calls[1][1]).toContain("'eval' '-b'");
  });

  it('returns image blocks for screenshot path responses and passes full-page screenshots through', async () => {
    const fakeB64 = Buffer.from('pngdata').toString('base64');
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '{"path":"/tmp/sero-agent-browser-shot.png"}', stderr: '', exitCode: 0 },
      { stdout: fakeB64, stderr: '', exitCode: 0 },
    ]);

    const result = await tool.execute('tc-2', { action: 'screenshot', full_page: true }, undefined, undefined, undefined as never);

    expect(exec.mock.calls[1][1]).toContain("'screenshot' '/tmp/sero-agent-browser-shot.png' '--full'");
    expect(result.content).toContainEqual({
      type: 'image',
      data: fakeB64,
      mimeType: 'image/png',
    });
    expect(result.content).toContainEqual({
      type: 'text',
      text: 'Full-page automation browser screenshot captured.',
    });
  });

  it('uses the schema default wait timeout for selector waits', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '{"message":"ready"}', stderr: '', exitCode: 0 },
    ]);

    await tool.execute('tc-3', { action: 'wait', selector: '#ready' }, undefined, undefined, undefined as never);

    expect(exec.mock.calls[1][1]).toContain("AGENT_BROWSER_DEFAULT_TIMEOUT='10000'");
    expect(exec.mock.calls[1][1]).toContain("'wait' '#ready'");
  });

  it('installs matching Playwright Chromium when only a mismatched cached executable is present', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      mismatchedBrowserPathResult,
      { stdout: 'installed browser\n', stderr: '', exitCode: 0 },
      browserPathResult,
      { stdout: '{"message":"opened","url":"about:blank"}', stderr: '', exitCode: 0 },
    ]);

    await tool.execute('tc-install-browser', { action: 'launch' }, undefined, undefined, undefined as never);

    expect(exec.mock.calls[2][1]).toContain('if [ -w /ms-playwright ]; then export PLAYWRIGHT_BROWSERS_PATH=/ms-playwright; else unset PLAYWRIGHT_BROWSERS_PATH; fi');
    expect(exec.mock.calls[2][1]).toContain('playwright@1.57.0 install chromium');
    expect(exec.mock.calls[4][1]).toContain("'--executable-path' '/root/.cache/ms-playwright/chromium-1200/chrome-linux/chrome'");
    expect(exec.mock.calls[4][1]).toContain("'open' 'about:blank'");
  });

  it('uses native wait command for timeout waits', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '{"message":"waited"}', stderr: '', exitCode: 0 },
    ]);

    await tool.execute('tc-4', { action: 'wait', timeout: 750 }, undefined, undefined, undefined as never);

    expect(exec.mock.calls[1][1]).toContain("'wait' '750'");
  });
});
