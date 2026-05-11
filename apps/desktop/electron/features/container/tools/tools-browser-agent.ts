import type { Static } from 'typebox';
import type { ToolDefinition, ExtensionContext } from '@mariozechner/pi-coding-agent';
import type { AgentToolResult, AgentToolUpdateCallback } from '@mariozechner/pi-agent-core';
import type { RuntimeBackend } from '@electron/features/workspace/runtime/types';
import {
  armRecordingAutoStop,
  clearRecordingState,
  finishRecordingState,
  formatBrowserText,
  recordingLimitNote,
  screenshotContent,
} from './tools-browser-agent-helpers';
import { BrowserParams, shellEscape } from './tool-schemas';

const metricsByWorkspace = new Map<string, { success: number; failure: number; totalLatencyMs: number }>();
const executablePathByWorkspace = new Map<string, string>();
const AGENT_BROWSER_PLAYWRIGHT_VERSION = '1.57.0';
const AGENT_BROWSER_CHROMIUM_REVISION = '1200';

interface AgentBrowserJson {
  success?: boolean;
  message?: string;
  error?: string;
  warning?: string;
  title?: string;
  url?: string;
  text?: string;
  output?: string;
  snapshot?: string;
  screenshot?: string;
  path?: string;
  running?: boolean;
  result?: unknown;
  refs?: Record<string, unknown>;
  data?: unknown;
}

interface AgentCommandOptions { execTimeoutMs?: number; defaultActionTimeoutMs?: number; }

function browserSessionName(workspaceId: string): string {
  return `sero-${workspaceId}`;
}

function command(args: string[], env?: Record<string, string | number | boolean | undefined>): string {
  const envPrefix = Object.entries(env ?? {})
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}='${shellEscape(String(value))}'`)
    .join(' ');
  const commandArgs = args.map((arg) => `'${shellEscape(arg)}'`).join(' ');
  return `${envPrefix ? `${envPrefix} ` : ''}agent-browser ${commandArgs}`;
}

function sessionCommand(
  workspaceId: string,
  args: string[],
  env?: Record<string, string | number | boolean | undefined>,
): string {
  const executablePath = executablePathByWorkspace.get(workspaceId);
  return command(
    ['--session', browserSessionName(workspaceId), ...(executablePath ? ['--executable-path', executablePath] : []), ...args],
    env,
  );
}

function parseJsonOutput(raw: string): AgentBrowserJson {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed) as AgentBrowserJson;
  } catch {
    const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(lines[i]) as AgentBrowserJson;
      } catch {
        continue;
      }
    }
  }
  return { output: trimmed };
}

function flattenDataPayload(data: unknown): Partial<AgentBrowserJson> {
  if (data === undefined) return {};
  if (typeof data === 'string') return { output: data };
  if (typeof data === 'number' || typeof data === 'boolean' || data === null) return { result: data };
  if (Array.isArray(data)) return { result: data };
  if (typeof data !== 'object') return { output: String(data) };

  const record = data as Record<string, unknown>;
  const flattened: Partial<AgentBrowserJson> = {};
  const knownKeys = ['message', 'error', 'warning', 'title', 'url', 'text', 'output', 'snapshot', 'screenshot', 'path', 'running', 'result'] as const;
  for (const key of knownKeys) {
    const value = record[key];
    if (value !== undefined) flattened[key] = value as never;
  }
  if (record.refs && typeof record.refs === 'object' && !Array.isArray(record.refs)) {
    flattened.refs = record.refs as Record<string, unknown>;
  }
  return Object.keys(flattened).length > 0 ? flattened : { result: record };
}

function normalizeResponse(response: AgentBrowserJson): AgentBrowserJson {
  return { ...response, ...flattenDataPayload(response.data) };
}

function looksLikeBase64(value: string): boolean {
  return /^[A-Za-z0-9+/=]+$/.test(value) && value.length > 64;
}

async function readImageAsBase64(runtime: RuntimeBackend, workspaceId: string, imagePath: string): Promise<string> {
  const escaped = shellEscape(imagePath);
  const result = await runtime.exec({
    command: `python3 -c "import base64;print(base64.b64encode(open('${escaped}','rb').read()).decode(), end='')"`,
    timeoutMs: 15_000,
  });
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    throw new Error(`Failed reading screenshot at ${imagePath}: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

async function resolveBrowserExecutable(runtime: RuntimeBackend, workspaceId: string): Promise<string | null> {
  const cached = executablePathByWorkspace.get(workspaceId);
  if (cached) return cached;

  const result = await runtime.exec({ command: `sh -lc 'for p in "$PLAYWRIGHT_BROWSERS_PATH"/chromium-${AGENT_BROWSER_CHROMIUM_REVISION}/chrome-linux/chrome /ms-playwright/chromium-${AGENT_BROWSER_CHROMIUM_REVISION}/chrome-linux/chrome "$HOME"/.cache/ms-playwright/chromium-${AGENT_BROWSER_CHROMIUM_REVISION}/chrome-linux/chrome /root/.cache/ms-playwright/chromium-${AGENT_BROWSER_CHROMIUM_REVISION}/chrome-linux/chrome /usr/bin/chromium /usr/bin/chromium-browser /usr/bin/google-chrome /usr/bin/google-chrome-stable "$PLAYWRIGHT_BROWSERS_PATH"/chromium-*/chrome-linux/chrome /ms-playwright/chromium-*/chrome-linux/chrome "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux/chrome /root/.cache/ms-playwright/chromium-*/chrome-linux/chrome; do if [ -x "$p" ]; then printf "%s" "$p"; exit 0; fi; done; command -v chromium 2>/dev/null || command -v chromium-browser 2>/dev/null || command -v google-chrome 2>/dev/null || command -v google-chrome-stable 2>/dev/null'`, timeoutMs: 10_000 });
  const executablePath = result.stdout.trim();
  if (result.exitCode === 0 && executablePath) {
    executablePathByWorkspace.set(workspaceId, executablePath);
    return executablePath;
  }
  return null;
}

async function ensureFfmpegAvailable(runtime: RuntimeBackend, workspaceId: string): Promise<void> {
  const existing = await runtime.exec({ command: "sh -lc 'set -- \"$PLAYWRIGHT_BROWSERS_PATH\"/ffmpeg-*/ffmpeg-linux /ms-playwright/ffmpeg-*/ffmpeg-linux \"$HOME\"/.cache/ms-playwright/ffmpeg-*/ffmpeg-linux /root/.cache/ms-playwright/ffmpeg-*/ffmpeg-linux; for p in \"$@\"; do if [ -x \"$p\" ]; then exit 0; fi; done; exit 1'", timeoutMs: 10_000 });
  if (existing.exitCode === 0) return;

  const install = await runtime.exec({ command: `sh -lc 'if [ -w /ms-playwright ]; then export PLAYWRIGHT_BROWSERS_PATH=/ms-playwright; fi; npx -y playwright@${AGENT_BROWSER_PLAYWRIGHT_VERSION} install ffmpeg'`, timeoutMs: 180_000 });
  if (install.exitCode !== 0) {
    throw new Error(`Failed to install Playwright ffmpeg for browser recording: ${install.stderr || install.stdout}`);
  }
}

async function ensureAgentBrowserAvailable(runtime: RuntimeBackend, workspaceId: string, options: { requireMatchingBrowser?: boolean } = {}): Promise<void> {
  const hasBinary = await runtime.exec({ command: 'command -v agent-browser', timeoutMs: 5_000 });
  if (hasBinary.exitCode !== 0) {
    const install = await runtime.exec({ command: 'npm install -g agent-browser', timeoutMs: 180_000 });
    if (install.exitCode !== 0) {
      throw new Error(`Failed to install agent-browser CLI: ${install.stderr || install.stdout}`);
    }

    const verify = await runtime.exec({ command: 'command -v agent-browser', timeoutMs: 5_000 });
    if (verify.exitCode !== 0) throw new Error('agent-browser CLI is not available after installation.');
  }
  if (!options.requireMatchingBrowser) return;
  const executablePath = await resolveBrowserExecutable(runtime, workspaceId);
  if (executablePath?.includes(`/chromium-${AGENT_BROWSER_CHROMIUM_REVISION}/`)) return;

  const installBrowser = await runtime.exec({ command: `sh -lc 'if [ -w /ms-playwright ]; then export PLAYWRIGHT_BROWSERS_PATH=/ms-playwright; fi; npx -y playwright@${AGENT_BROWSER_PLAYWRIGHT_VERSION} install chromium'`, timeoutMs: 180_000 });
  if (installBrowser.exitCode !== 0) {
    throw new Error(`Failed to install Playwright Chromium for agent-browser: ${installBrowser.stderr || installBrowser.stdout}`);
  }
  executablePathByWorkspace.delete(workspaceId);
  if (!await resolveBrowserExecutable(runtime, workspaceId)) {
    throw new Error('Chromium is installed but agent-browser could not locate an executable path.');
  }
}

async function runAgent(
  runtime: RuntimeBackend,
  workspaceId: string,
  args: string[],
  options: AgentCommandOptions = {},
): Promise<AgentBrowserJson> {
  const env = options.defaultActionTimeoutMs !== undefined
    ? { AGENT_BROWSER_DEFAULT_TIMEOUT: options.defaultActionTimeoutMs }
    : undefined;
  const result = await runtime.exec({
    command: sessionCommand(workspaceId, [...args, '--json'], env),
    timeoutMs: options.execTimeoutMs ?? 60_000,
  });
  const parsed = normalizeResponse(parseJsonOutput([result.stdout, result.stderr].filter(Boolean).join('\n')));
  if (result.exitCode !== 0) {
    const fallback = result.stderr || result.stdout || 'Unknown agent-browser error';
    throw new Error(parsed.error || fallback);
  }
  if (parsed.success === false) throw new Error(parsed.error || parsed.message || 'agent-browser command failed');
  return parsed;
}

async function runEval(
  runtime: RuntimeBackend,
  workspaceId: string,
  expression: string,
  options: AgentCommandOptions = {},
): Promise<AgentBrowserJson> {
  const encodedExpression = Buffer.from(expression, 'utf8').toString('base64');
  return runAgent(runtime, workspaceId, ['eval', '-b', encodedExpression], options);
}

async function assertViewportClickPoint(
  runtime: RuntimeBackend,
  workspaceId: string,
  x: number,
  y: number,
): Promise<void> {
  const response = await runEval(
    runtime,
    workspaceId,
    '(() => ({ width: window.innerWidth, height: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY }))()',
    { execTimeoutMs: 10_000 },
  );
  const viewport = response.result as { width?: number; height?: number; scrollX?: number; scrollY?: number } | undefined;
  const width = viewport?.width;
  const height = viewport?.height;
  const scrollX = viewport?.scrollX ?? 0;
  const scrollY = viewport?.scrollY ?? 0;

  if (typeof width !== 'number' || typeof height !== 'number') return;
  if (x >= 0 && y >= 0 && x <= width && y <= height) return;

  throw new Error(
    `Click coordinates (${x}, ${y}) are outside the current browser viewport (${Math.round(width)}×${Math.round(height)} CSS px; scroll ${Math.round(scrollX)}, ${Math.round(scrollY)}). ` +
    'Browser click coordinates must be relative to the visible viewport. Scroll the element into view first, or use selector click.',
  );
}

async function launchBrowser(
  runtime: RuntimeBackend,
  workspaceId: string,
  params: Static<typeof BrowserParams>,
): Promise<AgentBrowserJson> {
  const targetUrl = params.url ?? 'about:blank';
  const viewport = params.viewport;
  const hasViewport = viewport?.width !== undefined || viewport?.height !== undefined;
  let response: AgentBrowserJson;

  if (hasViewport) {
    response = await runAgent(runtime, workspaceId, ['open', 'about:blank']);
    await runAgent(
      runtime,
      workspaceId,
      ['set', 'viewport', String(viewport?.width ?? 1280), String(viewport?.height ?? 720)],
      { execTimeoutMs: 20_000 },
    );
    if (targetUrl !== 'about:blank') response = await runAgent(runtime, workspaceId, ['open', targetUrl]);
  } else {
    response = await runAgent(runtime, workspaceId, ['open', targetUrl]);
  }

  const waitUntil = params.wait_until ?? 'domcontentloaded';
  if (targetUrl !== 'about:blank' && waitUntil !== 'domcontentloaded') {
    await runAgent(runtime, workspaceId, ['wait', '--load', waitUntil], { execTimeoutMs: 30_000 });
  }
  return response;
}

export function createAgentBrowser(runtime: RuntimeBackend, workspaceId: string): ToolDefinition {
  return {
    name: 'browser',
    label: 'browser',
    description:
      'Control a hidden automation browser through Vercel agent-browser with persistent per-workspace sessions. ' +
      'This browser is separate from Sero\'s visible preview pane. Use launch first, then navigate/click/type/snapshot/screenshot/get_text/wait, and close when done.',
    parameters: BrowserParams,
    execute: async (
      _toolCallId: string,
      params: Static<typeof BrowserParams>,
      signal: AbortSignal | undefined,
      _onUpdate: AgentToolUpdateCallback | undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<unknown>> => {
      const startedAt = Date.now();
      const action = params.action;
      const record = (ok: boolean) => {
        const current = metricsByWorkspace.get(workspaceId) ?? { success: 0, failure: 0, totalLatencyMs: 0 };
        if (ok) current.success += 1;
        else current.failure += 1;
        current.totalLatencyMs += Date.now() - startedAt;
        metricsByWorkspace.set(workspaceId, current);
      };

      if (signal?.aborted) throw new Error('Operation aborted');

      try {
        const recordingState = action === 'stop_recording' ? finishRecordingState(workspaceId) : null;
        if (recordingState?.autoStopped) {
          record(true);
          return { content: [{ type: 'text', text: `Automation browser recording already auto-stopped after reaching the 120s limit. Saved to: ${recordingState.savePath}` }], details: undefined };
        }
        await ensureAgentBrowserAvailable(runtime, workspaceId, { requireMatchingBrowser: action === 'launch' || action === 'start_recording' });

        if (action === 'start_recording') {
          await ensureFfmpegAvailable(runtime, workspaceId);
          const targetPath = params.save_path ?? '/workspace/agent-browser-recording.webm';
          const targetDir = targetPath.includes('/') ? targetPath.slice(0, targetPath.lastIndexOf('/')) : '';
          if (targetDir) await runtime.exec({ command: `mkdir -p '${shellEscape(targetDir)}'`, timeoutMs: 10_000 });
          let response: AgentBrowserJson;
          try {
            response = await runAgent(runtime, workspaceId, ['record', 'start', targetPath], { execTimeoutMs: 20_000 });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!/already (?:in progress|active)/i.test(message)) throw error;
            response = await runAgent(runtime, workspaceId, ['record', 'restart', targetPath], { execTimeoutMs: 20_000 });
          }
          armRecordingAutoStop(workspaceId, targetPath, async () => {
            await ensureFfmpegAvailable(runtime, workspaceId);
            await runAgent(runtime, workspaceId, ['record', 'stop'], { execTimeoutMs: 60_000 });
          });
          record(true);
          return { content: [{ type: 'text', text: `${formatBrowserText(response, `Recording started: ${targetPath}`)}\n${recordingLimitNote()}` }], details: undefined };
        }

        if (action === 'stop_recording') {
          await ensureFfmpegAvailable(runtime, workspaceId);
          const response = await runAgent(runtime, workspaceId, ['record', 'stop'], { execTimeoutMs: 60_000 });
          record(true);
          return { content: [{ type: 'text', text: formatBrowserText(response, 'Automation browser recording stopped.') }], details: undefined };
        }

        if (action === 'close') {
          clearRecordingState(workspaceId);
          await runAgent(runtime, workspaceId, ['close'], { execTimeoutMs: 20_000 });
          record(true);
          return { content: [{ type: 'text', text: 'Automation browser closed.' }], details: undefined };
        }

        if (action === 'launch') {
          const response = await launchBrowser(runtime, workspaceId, params);
          record(true);
          return {
            content: [{ type: 'text', text: formatBrowserText(response, params.url ? `Opened ${params.url} in the automation browser.` : 'Automation browser launched.') }],
            details: undefined,
          };
        }

        if (action === 'navigate') {
          if (!params.url) throw new Error('url is required for navigate');
          const response = await runAgent(runtime, workspaceId, ['open', params.url]);
          const waitUntil = params.wait_until ?? 'domcontentloaded';
          if (waitUntil !== 'domcontentloaded') {
            await runAgent(runtime, workspaceId, ['wait', '--load', waitUntil], { execTimeoutMs: 30_000 });
          }
          record(true);
          return { content: [{ type: 'text', text: formatBrowserText(response, `Opened ${params.url}`) }], details: undefined };
        }

        if (action === 'click') {
          if (params.selector) {
            const response = await runAgent(runtime, workspaceId, ['click', params.selector]);
            record(true);
            return { content: [{ type: 'text', text: formatBrowserText(response, `Clicked ${params.selector}`) }], details: undefined };
          }
          if (params.x !== undefined && params.y !== undefined) {
            await assertViewportClickPoint(runtime, workspaceId, params.x, params.y);
            await runAgent(runtime, workspaceId, ['mouse', 'move', String(params.x), String(params.y)], { execTimeoutMs: 20_000 });
            await runAgent(runtime, workspaceId, ['mouse', 'down', 'left'], { execTimeoutMs: 20_000 });
            await runAgent(runtime, workspaceId, ['mouse', 'up', 'left'], { execTimeoutMs: 20_000 });
            record(true);
            return { content: [{ type: 'text', text: `Clicked (${params.x}, ${params.y})` }], details: undefined };
          }
          throw new Error("Provide 'selector' or both 'x' and 'y'");
        }

        if (action === 'type') {
          if (!params.text) throw new Error('text is required for type action');
          if (params.selector) {
            if (params.clear) {
              await runAgent(runtime, workspaceId, ['fill', params.selector, params.text]);
              record(true);
              return { content: [{ type: 'text', text: `Filled ${params.selector}.` }], details: undefined };
            }
            const response = await runAgent(runtime, workspaceId, ['type', params.selector, params.text]);
            record(true);
            return { content: [{ type: 'text', text: formatBrowserText(response, `Typed into ${params.selector}`) }], details: undefined };
          }
          const response = await runAgent(runtime, workspaceId, ['keyboard', 'type', params.text]);
          record(true);
          return { content: [{ type: 'text', text: formatBrowserText(response, 'Typed into focused element.') }], details: undefined };
        }

        if (action === 'press_key') {
          if (!params.key) throw new Error('key is required for press_key action');
          const response = await runAgent(runtime, workspaceId, ['press', params.key]);
          record(true);
          return { content: [{ type: 'text', text: formatBrowserText(response, `Pressed ${params.key}`) }], details: undefined };
        }

        if (action === 'scroll') {
          const direction = params.direction ?? 'down';
          const amount = String(params.amount ?? 500);
          const args = ['scroll', direction, amount];
          if (params.selector) args.push('--selector', params.selector);
          const response = await runAgent(runtime, workspaceId, args);
          record(true);
          return { content: [{ type: 'text', text: formatBrowserText(response, `Scrolled ${direction}`) }], details: undefined };
        }

        if (action === 'evaluate') {
          if (!params.expression) throw new Error('expression is required for evaluate');
          const response = await runEval(runtime, workspaceId, params.expression);
          record(true);
          return { content: [{ type: 'text', text: formatBrowserText(response) }], details: undefined };
        }

        if (action === 'get_text') {
          const response = await runAgent(
            runtime,
            workspaceId,
            params.selector ? ['get', 'text', params.selector] : ['get', 'text', 'body'],
          );
          record(true);
          return { content: [{ type: 'text', text: formatBrowserText(response, 'Text retrieved.') }], details: undefined };
        }

        if (action === 'snapshot') {
          const response = await runAgent(runtime, workspaceId, ['snapshot'], { execTimeoutMs: 20_000 });
          record(true);
          return { content: [{ type: 'text', text: formatBrowserText(response, 'Snapshot captured.') }], details: undefined };
        }

        if (action === 'wait') {
          const timeoutMs = params.timeout ?? 10_000;
          const response = params.selector
            ? await runAgent(runtime, workspaceId, ['wait', params.selector], { execTimeoutMs: timeoutMs + 10_000, defaultActionTimeoutMs: timeoutMs })
            : await runAgent(runtime, workspaceId, ['wait', String(timeoutMs)], { execTimeoutMs: timeoutMs + 10_000 });
          record(true);
          return {
            content: [{ type: 'text', text: formatBrowserText(response, params.selector ? `Element '${params.selector}' is ready.` : `Waited ${timeoutMs}ms.`) }],
            details: undefined,
          };
        }

        if (action === 'screenshot') {
          const shotPath = '/tmp/sero-agent-browser-shot.png';
          const screenshotArgs = ['screenshot', shotPath];
          if (params.full_page) screenshotArgs.push('--full');
          const response = await runAgent(runtime, workspaceId, screenshotArgs, { execTimeoutMs: 20_000 });
          const imagePath = response.path || shotPath;
          const imageData = response.screenshot && looksLikeBase64(response.screenshot)
            ? response.screenshot
            : await readImageAsBase64(runtime, workspaceId, imagePath);
          record(true);
          return {
            content: screenshotContent(imageData, formatBrowserText(response, params.full_page ? 'Full-page automation browser screenshot captured.' : 'Automation browser screenshot captured.')),
            details: undefined,
          };
        }

        throw new Error(`Unsupported action for agent-browser backend: ${action}`);
      } catch (error) {
        record(false);
        throw error;
      }
    },
  };
}
