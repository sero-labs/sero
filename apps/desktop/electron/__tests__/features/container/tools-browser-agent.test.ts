import { beforeEach, describe, expect, it, vi } from 'vitest';
import generatedArtifacts from '@electron/features/workspace/runtime/browser-pack/generated-artifacts.json';
import type { RuntimeBackend } from '@electron/features/workspace/runtime/types';
import type { BrowserRuntimeAdapter } from '@electron/features/workspace/runtime/browser-pack/types';
import { createAgentBrowser } from '@electron/features/container/tools/tools-browser-agent';
import {
  agentBrowserCommand,
  BrowserPackRequiredError,
  ensureFfmpegAvailable,
  resolveBrowserAutomationRuntime,
  toHostShellPath,
} from '@electron/features/container/tools/tools-browser-runtime-adapter';

type ExecResult = { stdout: string; stderr: string; exitCode: number };

const chromiumRevision = generatedArtifacts.pins.chromiumRevision;
const BROWSER_PATH = `/root/.cache/ms-playwright/chromium-${chromiumRevision}/chrome-linux/chrome`;
const DOCKER_CACHE_BROWSER_PATH = `/tmp/sero-home/.cache/ms-playwright/chromium-${chromiumRevision}/chrome-linux/chrome`;
const APPLE_BROWSER_PATH = `/ms-playwright/chromium-${chromiumRevision}/chrome-linux/chrome`;
const viewportResult: ExecResult = {
  stdout: '{"result":{"width":1280,"height":720,"scrollX":0,"scrollY":0}}',
  stderr: '',
  exitCode: 0,
};
const ffmpegCacheResult: ExecResult = { stdout: '', stderr: '', exitCode: 0 };

const containerAdapter: BrowserRuntimeAdapter = {
  browsersPath: '/ms-playwright',
  chromiumExecutableCandidates: [BROWSER_PATH],
  ffmpegCandidates: ['/usr/local/bin/ffmpeg'],
  agentBrowserCandidates: [],
  pathPrefixes: [],
  tempDir: '/tmp',
  env: { PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright' },
};

function createExecMock(results: ExecResult[]) {
  const exec = vi.fn();
  for (const result of results) {
    exec.mockResolvedValueOnce(result);
  }
  return exec;
}

async function createToolWithExec(results: ExecResult[]) {
  const exec = createExecMock(results);
  const runtime = {
    backend: 'docker',
    exec: (input: { command: string; cwd?: string; timeoutMs?: number }) => exec('ws-1', input.command, input.cwd, input.timeoutMs),
    createDirectory: (input: { path: string }) => exec('ws-1', `mkdir -p '${input.path}'`, undefined, undefined),
  } as unknown as RuntimeBackend;
  const tool = createAgentBrowser(runtime, 'ws-1', async () => ({ adapter: containerAdapter, executablePath: BROWSER_PATH }));
  return { tool, exec };
}

describe('createAgentBrowser', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('exposes hidden runtime automation under an explicit tool name', async () => {
    const { tool } = await createToolWithExec([]);

    expect(tool.name).toBe('automation_browser');
    expect(tool.label).toBe('automation_browser');
    expect(tool.description).toContain('hidden automation browser');
  });

  it('returns typed browser-pack metadata when host browser pack is missing', async () => {
    const exec = createExecMock([]);
    const runtime = { backend: 'host', exec: (input: { command: string }) => exec('ws-1', input.command) } as unknown as RuntimeBackend;
    const tool = createAgentBrowser(runtime, 'ws-1', async () => {
      throw new BrowserPackRequiredError({
        state: 'installable',
        manifestVersion: '2026.05.16',
        artifactKey: 'darwin-arm64',
        error: {
          code: 'BROWSER_PACK_REQUIRED',
          message: 'Host browser automation pack is not installed.',
          retryable: true,
          installable: true,
          manifestVersion: '2026.05.16',
          artifactKey: 'darwin-arm64',
        },
      });
    });

    await expect(tool.execute('tc-host-missing', { action: 'launch' }, undefined, undefined, undefined as never)).rejects.toMatchObject({
      code: 'BROWSER_PACK_REQUIRED',
      installable: true,
      status: { state: 'installable', artifactKey: 'darwin-arm64' },
    });
    expect(exec).not.toHaveBeenCalled();
  });

  it('uses the host browser-pack adapter when installed', async () => {
    const exec = createExecMock([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '{"message":"opened","url":"about:blank"}', stderr: '', exitCode: 0 },
    ]);
    const hostAdapter: BrowserRuntimeAdapter = {
      browsersPath: '/fixed/toolchains/2026.05.16/browser',
      chromiumExecutableCandidates: ['/fixed/toolchains/2026.05.16/browser/chromium/chrome'],
      ffmpegCandidates: ['/fixed/toolchains/2026.05.16/browser/ffmpeg/ffmpeg'],
      agentBrowserCandidates: ['/fixed/toolchains/2026.05.16/browser/agent-browser/bin/agent-browser'],
      pathPrefixes: ['/fixed/toolchains/2026.05.16/browser/agent-browser/bin', '/fixed/toolchains/2026.05.16/browser/ffmpeg'],
      tempDir: '/fixed/toolchains/2026.05.16/browser/tmp',
      env: { PLAYWRIGHT_BROWSERS_PATH: '/fixed/toolchains/2026.05.16/browser' },
    };
    const runtime = { backend: 'host', exec: (input: { command: string; timeoutMs?: number }) => exec('ws-1', input.command, undefined, input.timeoutMs) } as unknown as RuntimeBackend;
    const tool = createAgentBrowser(runtime, 'ws-1', async () => ({ adapter: hostAdapter, executablePath: hostAdapter.chromiumExecutableCandidates[0] ?? null }));

    await tool.execute('tc-host-installed', { action: 'launch' }, undefined, undefined, undefined as never);

    expect(exec.mock.calls[0][1]).toContain("export PATH='/fixed/toolchains/2026.05.16/browser/agent-browser/bin:/fixed/toolchains/2026.05.16/browser/ffmpeg':\"$PATH\"; command -v agent-browser");
    expect(exec.mock.calls[1][1]).toContain("export PLAYWRIGHT_BROWSERS_PATH='/fixed/toolchains/2026.05.16/browser'");
    expect(exec.mock.calls[1][1]).toContain("export PATH='/fixed/toolchains/2026.05.16/browser/agent-browser/bin:/fixed/toolchains/2026.05.16/browser/ffmpeg':\"$PATH\"");
    expect(exec.mock.calls[1][1].indexOf('/agent-browser/bin')).toBeLessThan(exec.mock.calls[1][1].indexOf(':\"$PATH\"'));
    expect(exec.mock.calls[1][1]).toContain("'--executable-path' '/fixed/toolchains/2026.05.16/browser/chromium/chrome'");
    expect(exec.mock.calls[1][1]).toContain("'open' 'about:blank'");
  });

  it('renders Windows host browser-pack PATH entries for Git Bash', () => {
    const hostAdapter: BrowserRuntimeAdapter = {
      browsersPath: 'C:\\Users\\me\\.sero-ui\\toolchains\\browser-pack\\browser',
      chromiumExecutableCandidates: ['C:\\Users\\me\\.sero-ui\\toolchains\\browser-pack\\browser\\chromium\\chrome.exe'],
      ffmpegCandidates: ['C:\\Users\\me\\.sero-ui\\toolchains\\browser-pack\\browser\\ffmpeg\\ffmpeg.exe'],
      agentBrowserCandidates: ['C:\\Users\\me\\.sero-ui\\toolchains\\browser-pack\\browser\\agent-browser\\bin\\agent-browser.cmd'],
      pathPrefixes: ['C:\\Users\\me\\.sero-ui\\toolchains\\browser-pack\\browser\\agent-browser\\bin'],
      tempDir: 'C:\\Users\\me\\.sero-ui\\toolchains\\browser-pack\\browser\\tmp',
      env: { PLAYWRIGHT_BROWSERS_PATH: 'C:\\Users\\me\\.sero-ui\\toolchains\\browser-pack\\browser' },
    };

    const command = agentBrowserCommand(hostAdapter, ['open', 'about:blank'], undefined, 'win32');

    expect(toHostShellPath('C:\\Users\\me\\repo', 'win32')).toBe('/c/Users/me/repo');
    expect(command).toContain("export PATH='/c/Users/me/.sero-ui/toolchains/browser-pack/browser/agent-browser/bin:/c/Users/me/.sero-ui/toolchains/browser-pack/browser/ffmpeg':\"$PATH\";");
    expect(command).toContain("export PLAYWRIGHT_BROWSERS_PATH='C:\\Users\\me\\.sero-ui\\toolchains\\browser-pack\\browser'");
  });

  it('does not globally install agent-browser when the CLI is missing', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '', stderr: '', exitCode: 1 },
    ]);

    await expect(tool.execute('tc-install', { action: 'launch' }, undefined, undefined, undefined as never)).rejects.toThrow('agent-browser CLI is not available');

    expect(exec.mock.calls[0][1]).toBe('command -v agent-browser');
    expect(exec.mock.calls.some((call) => String(call[1]).includes('npm install -g agent-browser'))).toBe(false);
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
      { stdout: '{"success":false,"error":"CDP command timed out: Page.navigate"}', stderr: '', exitCode: 1 },
      { stdout: '{"success":true,"data":{"closed":true}}', stderr: '', exitCode: 0 },
      { stdout: '{"success":true,"data":{"url":"about:blank"}}', stderr: '', exitCode: 0 },
    ]);

    const result = await tool.execute('tc-launch-timeout', { action: 'launch', url: 'https://example.com' }, undefined, undefined, undefined as never);

    expect(exec.mock.calls[1][1]).toContain("'open' 'https://example.com'");
    expect(exec.mock.calls[2][1]).toContain("'close' '--json'");
    expect(exec.mock.calls[3][1]).toContain("'open' 'about:blank'");
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
    expect(exec.mock.calls[1][1]).toContain('command -v ffmpeg');
    expect(exec.mock.calls[2][1]).toContain("mkdir -p '/workspace/browser-e2e'");
    expect(exec.mock.calls[3][1]).toContain("export PLAYWRIGHT_BROWSERS_PATH='/ms-playwright'");
    expect(exec.mock.calls[3][1]).toContain(`'--executable-path' '${BROWSER_PATH}'`);
    expect(exec.mock.calls[3][1]).toContain("'record' 'start'");
  });

  it('auto-stops recordings after the 120s safety limit', async () => {
    vi.useFakeTimers();
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
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
    expect(exec).toHaveBeenCalledTimes(6);
    expect(exec.mock.calls[5][1]).toContain("'record' 'stop'");
  });

  it('restarts recording when a stale recording is already active', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
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
    expect(exec.mock.calls[3][1]).toContain("'record' 'start'");
    expect(exec.mock.calls[4][1]).toContain("'record' 'restart'");
  });

  it('reports missing ffmpeg instead of installing Playwright globally', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '', stderr: '', exitCode: 1 },
    ]);

    await expect(tool.execute(
      'tc-install-ffmpeg',
      { action: 'start_recording', save_path: '/workspace/capture.webm' },
      undefined,
      undefined,
      undefined as never,
    )).rejects.toThrow('ffmpeg is not available');

    expect(exec.mock.calls.some((call) => String(call[1]).includes('playwright@1.57.0 install ffmpeg'))).toBe(false);
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
    const dockerExec = createExecMock([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '{"message":"opened","url":"about:blank"}', stderr: '', exitCode: 0 },
    ]);
    const appleExec = createExecMock([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '{"message":"opened","url":"about:blank"}', stderr: '', exitCode: 0 },
    ]);
    const dockerTool = createAgentBrowser(
      { backend: 'docker', exec: (input: { command: string; cwd?: string; timeoutMs?: number }) => dockerExec('ws-1', input.command, input.cwd, input.timeoutMs) } as unknown as RuntimeBackend,
      'ws-1',
      async () => ({ adapter: containerAdapter, executablePath: DOCKER_CACHE_BROWSER_PATH }),
    );
    const appleTool = createAgentBrowser(
      { backend: 'apple-container', exec: (input: { command: string; cwd?: string; timeoutMs?: number }) => appleExec('ws-1', input.command, input.cwd, input.timeoutMs) } as unknown as RuntimeBackend,
      'ws-1',
      async () => ({ adapter: containerAdapter, executablePath: APPLE_BROWSER_PATH }),
    );

    await dockerTool.execute('tc-docker-launch', { action: 'launch' }, undefined, undefined, undefined as never);
    await appleTool.execute('tc-apple-launch', { action: 'launch' }, undefined, undefined, undefined as never);

    expect(dockerExec.mock.calls[1][1]).toContain("'--session' 'sero-ws-1-docker'");
    expect(dockerExec.mock.calls[1][1]).toContain(`'--executable-path' '${DOCKER_CACHE_BROWSER_PATH}'`);
    expect(dockerExec.mock.calls[1][1]).toContain("export PLAYWRIGHT_BROWSERS_PATH='/ms-playwright'");
    expect(appleExec.mock.calls[1][1]).toContain("'--session' 'sero-ws-1-apple-container'");
    expect(appleExec.mock.calls[1][1]).toContain(`'--executable-path' '${APPLE_BROWSER_PATH}'`);
    expect(appleExec.mock.calls[1][1]).toContain("'open' 'about:blank'");
  });

  it('supports launch without a url by opening about:blank', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '{"message":"Browser launched","url":"about:blank"}', stderr: '', exitCode: 0 },
    ]);

    const result = await tool.execute('tc-launch', { action: 'launch' }, undefined, undefined, undefined as never);

    expect(exec.mock.calls[1][1]).toContain(`'--executable-path' '${BROWSER_PATH}'`);
    expect(exec.mock.calls[1][1]).toContain("'open' 'about:blank'");
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

  it('supports text= selectors for click without using CSS selector mode', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '{"result":{"ok":true,"text":"Sport","url":"https://www.bbc.co.uk/news"}}', stderr: '', exitCode: 0 },
    ]);

    await tool.execute('tc-click-text', { action: 'click', selector: 'text=Sport' }, undefined, undefined, undefined as never);

    expect(exec.mock.calls[1][1]).toContain("'eval' '-b'");
    expect(exec.mock.calls[1][1]).not.toContain("'click' 'text=Sport'");
  });

  it('rejects snapshot refs as click selectors with guidance', async () => {
    const { tool } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
    ]);

    await expect(
      tool.execute('tc-click-ref', { action: 'click', selector: '[ref=e136]' }, undefined, undefined, undefined as never),
    ).rejects.toThrow('Snapshot refs are not DOM selectors');
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
    const exec = createExecMock([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '{"path":"/tmp/sero-agent-browser-shot.png"}', stderr: '', exitCode: 0 },
    ]);
    const runtime = {
      backend: 'docker',
      exec: (input: { command: string; cwd?: string; timeoutMs?: number }) => exec('ws-1', input.command, input.cwd, input.timeoutMs),
      createDirectory: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue({ content: fakeB64, encoding: 'base64' }),
    } as unknown as RuntimeBackend;
    const tool = createAgentBrowser(runtime, 'ws-1', async () => ({ adapter: containerAdapter, executablePath: BROWSER_PATH }));

    const result = await tool.execute('tc-2', { action: 'screenshot', full_page: true }, undefined, undefined, undefined as never);

    expect(exec.mock.calls[1][1]).toContain("'screenshot' '/tmp/sero-agent-browser-shot.png' '--full'");
    expect(result.content).toContainEqual({ type: 'image', data: fakeB64, mimeType: 'image/png' });
    expect(result.content).toContainEqual({ type: 'text', text: 'Full-page automation browser screenshot captured.' });
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

  it('uses the adapter browser path without installing Playwright Chromium globally', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '{"message":"opened","url":"about:blank"}', stderr: '', exitCode: 0 },
    ]);

    await tool.execute('tc-install-browser', { action: 'launch' }, undefined, undefined, undefined as never);

    expect(exec.mock.calls.some((call) => String(call[1]).includes('playwright@1.57.0 install chromium'))).toBe(false);
    expect(exec.mock.calls[1][1]).toContain(`'--executable-path' '${BROWSER_PATH}'`);
    expect(exec.mock.calls[1][1]).toContain("'open' 'about:blank'");
  });

  it('derives container browser and ffmpeg paths from generated browser-pack pins', async () => {
    const exec = createExecMock([
      { stdout: BROWSER_PATH, stderr: '', exitCode: 0 },
      { stdout: '', stderr: '', exitCode: 0 },
    ]);
    const runtime = {
      backend: 'docker',
      runtimeWorkspacePath: '/workspace',
      exec: (input: { command: string; timeoutMs?: number }) => exec('ws-1', input.command, undefined, input.timeoutMs),
    } as unknown as RuntimeBackend;

    const resolved = await resolveBrowserAutomationRuntime(runtime, 'ws-1');
    await ensureFfmpegAvailable(runtime, resolved.adapter);

    expect(exec.mock.calls[0][1]).toContain(`chromium-${generatedArtifacts.pins.chromiumRevision}/chrome-linux/chrome`);
    expect(exec.mock.calls[1][1]).toContain(`ffmpeg-${generatedArtifacts.pins.ffmpegRevision}/ffmpeg-linux`);
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
