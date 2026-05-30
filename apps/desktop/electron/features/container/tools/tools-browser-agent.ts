import type { Static } from 'typebox';
import type { ToolDefinition, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { AgentToolResult, AgentToolUpdateCallback } from '@earendil-works/pi-agent-core';
import type { RuntimeBackend } from '@electron/features/workspace/runtime/types';
import type { BrowserRuntimeAdapter } from '@electron/features/workspace/runtime/browser-pack/types';
import {
  agentBrowserCommand,
  defaultRecordingPath,
  defaultScreenshotPath,
  ensureAgentBrowserAvailable,
  ensureFfmpegAvailable,
  resolveBrowserAutomationRuntime,
  type BrowserAutomationRuntimeResolver,
} from './tools-browser-runtime-adapter';
import {
  armRecordingAutoStop,
  clearRecordingState,
  finishRecordingState,
  formatBrowserText,
  recordingLimitNote,
  screenshotContent,
} from './tools-browser-agent-helpers';
import { BrowserParams } from './tool-schemas';
import { clickByText, textSelectorValue } from './tools-browser-agent-text';
import type { AgentBrowserJson, AgentCommandOptions } from './tools-browser-agent-types';

const metricsByWorkspace = new Map<string, { success: number; failure: number; totalLatencyMs: number }>();

function browserSessionName(workspaceId: string, backend: RuntimeBackend['backend']): string {
  return `sero-${workspaceId}-${backend}`;
}

function sessionCommand(
  adapter: BrowserRuntimeAdapter,
  workspaceId: string,
  backend: RuntimeBackend['backend'],
  executablePath: string | null,
  args: string[],
  env?: Record<string, string | number | boolean | undefined>,
): string {
  return agentBrowserCommand(
    adapter,
    ['--session', browserSessionName(workspaceId, backend), ...(executablePath ? ['--executable-path', executablePath] : []), ...args],
    env,
    backend === 'host' ? process.platform : undefined,
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

async function readImageAsBase64(runtime: RuntimeBackend, imagePath: string): Promise<string> {
  const file = await runtime.readFile({ path: imagePath, binary: true });
  const content = file.content.trim();
  if (file.encoding !== 'base64' || !content) {
    throw new Error(`Failed reading screenshot at ${imagePath}.`);
  }
  return content;
}

function runtimeDirname(filePath: string): string {
  const separatorIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return separatorIndex > 0 ? filePath.slice(0, separatorIndex) : '';
}

async function closeBrowserSessionQuietly(runtime: RuntimeBackend, adapter: BrowserRuntimeAdapter, workspaceId: string, executablePath: string | null): Promise<void> {
  await runtime.exec({ command: sessionCommand(adapter, workspaceId, runtime.backend, executablePath, ['close', '--json']), timeoutMs: 10_000 }).catch(() => undefined);
}

function isNavigationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Page\.navigate|Navigation failed|ERR_|net::|timed out/i.test(message);
}

async function runAgent(
  runtime: RuntimeBackend,
  adapter: BrowserRuntimeAdapter,
  workspaceId: string,
  executablePath: string | null,
  args: string[],
  options: AgentCommandOptions = {},
): Promise<AgentBrowserJson> {
  const env = options.defaultActionTimeoutMs !== undefined
    ? { AGENT_BROWSER_DEFAULT_TIMEOUT: options.defaultActionTimeoutMs }
    : undefined;
  const result = await runtime.exec({
    command: sessionCommand(adapter, workspaceId, runtime.backend, executablePath, [...args, '--json'], env),
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
  adapter: BrowserRuntimeAdapter,
  workspaceId: string,
  executablePath: string | null,
  expression: string,
  options: AgentCommandOptions = {},
): Promise<AgentBrowserJson> {
  const encodedExpression = Buffer.from(expression, 'utf8').toString('base64');
  return runAgent(runtime, adapter, workspaceId, executablePath, ['eval', '-b', encodedExpression], options);
}

async function assertViewportClickPoint(
  runtime: RuntimeBackend,
  adapter: BrowserRuntimeAdapter,
  workspaceId: string,
  executablePath: string | null,
  x: number,
  y: number,
): Promise<void> {
  const response = await runEval(
    runtime,
    adapter,
    workspaceId,
    executablePath,
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

async function openBrowserUrl(runtime: RuntimeBackend, adapter: BrowserRuntimeAdapter, workspaceId: string, executablePath: string | null, targetUrl: string): Promise<AgentBrowserJson> {
  try {
    return await runAgent(runtime, adapter, workspaceId, executablePath, ['open', targetUrl]);
  } catch (error) {
    if (!isNavigationError(error)) throw error;
    await closeBrowserSessionQuietly(runtime, adapter, workspaceId, executablePath);
    await runAgent(runtime, adapter, workspaceId, executablePath, ['open', 'about:blank']).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, warning: `Navigation to ${targetUrl} failed and the browser session was reset: ${message}`, url: 'about:blank' };
  }
}

async function launchBrowser(
  runtime: RuntimeBackend,
  adapter: BrowserRuntimeAdapter,
  workspaceId: string,
  executablePath: string | null,
  params: Static<typeof BrowserParams>,
): Promise<AgentBrowserJson> {
  const targetUrl = params.url ?? 'about:blank';
  const viewport = params.viewport;
  const hasViewport = viewport?.width !== undefined || viewport?.height !== undefined;
  let response: AgentBrowserJson;
  if (hasViewport) {
    response = await openBrowserUrl(runtime, adapter, workspaceId, executablePath, 'about:blank');
    await runAgent(runtime, adapter, workspaceId, executablePath, ['set', 'viewport', String(viewport?.width ?? 1280), String(viewport?.height ?? 720)], { execTimeoutMs: 20_000 });
    if (targetUrl !== 'about:blank') response = await openBrowserUrl(runtime, adapter, workspaceId, executablePath, targetUrl);
  } else {
    response = await openBrowserUrl(runtime, adapter, workspaceId, executablePath, targetUrl);
  }
  const waitUntil = params.wait_until ?? 'domcontentloaded';
  if (targetUrl !== 'about:blank' && waitUntil !== 'domcontentloaded' && response.success !== false) {
    await runAgent(runtime, adapter, workspaceId, executablePath, ['wait', '--load', waitUntil], { execTimeoutMs: 30_000 });
  }
  return response;
}

export function createAgentBrowser(runtime: RuntimeBackend, workspaceId: string, resolveRuntime: BrowserAutomationRuntimeResolver = resolveBrowserAutomationRuntime): ToolDefinition {
  let automationRuntime: { adapter: BrowserRuntimeAdapter; executablePath: string | null } | null = null;

  return {
    name: 'automation_browser',
    label: 'automation_browser',
    description:
      'Control a hidden automation browser through Vercel agent-browser with persistent per-workspace sessions. ' +
      'This does not open Sero\'s visible Browser panel and is not captured by sero app record/screenshot. ' +
      'For user-facing website browsing, visible browser UI, or screen-recording tasks, use the sero-cli tool with sero browser/app commands instead. ' +
      'Use automation_browser only when you specifically need runtime/headless browser automation evidence. ' +
      'Use launch first, then navigate/click/type/snapshot/screenshot/get_text/wait, and close when done. ' +
      'Click selector accepts CSS selectors or text=<visible text>; snapshot refs like [ref=e123] are not DOM selectors.',
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
        if (runtime.backend === 'host') {
          automationRuntime ??= await resolveRuntime(runtime, workspaceId);
          await ensureAgentBrowserAvailable(runtime, automationRuntime.adapter);
        } else {
          await ensureAgentBrowserAvailable(runtime);
          automationRuntime ??= await resolveRuntime(runtime, workspaceId);
        }
        const executablePath = automationRuntime.executablePath;
        const adapter = automationRuntime.adapter;

        if (action === 'start_recording') {
          await ensureFfmpegAvailable(runtime, adapter);
          const targetPath = params.save_path ?? defaultRecordingPath(runtime);
          const targetDir = targetPath.includes('/') ? targetPath.slice(0, targetPath.lastIndexOf('/')) : '';
          if (targetDir) await runtime.createDirectory({ path: targetDir, recursive: true });
          let response: AgentBrowserJson;
          try {
            response = await runAgent(runtime, adapter, workspaceId, executablePath, ['record', 'start', targetPath], { execTimeoutMs: 20_000 });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!/already (?:in progress|active)/i.test(message)) throw error;
            response = await runAgent(runtime, adapter, workspaceId, executablePath, ['record', 'restart', targetPath], { execTimeoutMs: 20_000 });
          }
          armRecordingAutoStop(workspaceId, targetPath, async () => {
            await ensureFfmpegAvailable(runtime, adapter);
            await runAgent(runtime, adapter, workspaceId, executablePath, ['record', 'stop'], { execTimeoutMs: 60_000 });
          });
          record(true);
          return { content: [{ type: 'text', text: `${formatBrowserText(response, `Recording started: ${targetPath}`)}\n${recordingLimitNote()}` }], details: undefined };
        }

        if (action === 'stop_recording') {
          await ensureFfmpegAvailable(runtime, adapter);
          const response = await runAgent(runtime, adapter, workspaceId, executablePath, ['record', 'stop'], { execTimeoutMs: 60_000 });
          record(true);
          return { content: [{ type: 'text', text: formatBrowserText(response, 'Automation browser recording stopped.') }], details: undefined };
        }

        if (action === 'close') {
          clearRecordingState(workspaceId);
          await runAgent(runtime, adapter, workspaceId, executablePath, ['close'], { execTimeoutMs: 20_000 });
          record(true);
          return { content: [{ type: 'text', text: 'Automation browser closed.' }], details: undefined };
        }

        if (action === 'launch') {
          const response = await launchBrowser(runtime, adapter, workspaceId, executablePath, params);
          record(true);
          return {
            content: [{ type: 'text', text: formatBrowserText(response, params.url ? `Opened ${params.url} in the automation browser.` : 'Automation browser launched.') }],
            details: undefined,
          };
        }

        if (action === 'navigate') {
          if (!params.url) throw new Error('url is required for navigate');
          const response = await openBrowserUrl(runtime, adapter, workspaceId, executablePath, params.url);
          const waitUntil = params.wait_until ?? 'domcontentloaded';
          if (waitUntil !== 'domcontentloaded' && response.success !== false) {
            await runAgent(runtime, adapter, workspaceId, executablePath, ['wait', '--load', waitUntil], { execTimeoutMs: 30_000 });
          }
          record(true);
          return { content: [{ type: 'text', text: formatBrowserText(response, `Opened ${params.url}`) }], details: undefined };
        }

        if (action === 'click') {
          if (params.selector) {
            const textTarget = textSelectorValue(params.selector);
            if (textTarget !== null) {
              const response = await clickByText({ runtime, adapter, workspaceId, executablePath, text: textTarget, runEval });
              record(true);
              return { content: [{ type: 'text', text: formatBrowserText(response, `Clicked text=${textTarget}`) }], details: undefined };
            }
            if (/^\[ref=e\d+\]$/i.test(params.selector.trim())) {
              throw new Error('Snapshot refs are not DOM selectors. Use text=<visible text>, a CSS selector, or viewport x/y coordinates.');
            }
            const response = await runAgent(runtime, adapter, workspaceId, executablePath, ['click', params.selector]);
            record(true);
            return { content: [{ type: 'text', text: formatBrowserText(response, `Clicked ${params.selector}`) }], details: undefined };
          }
          if (params.x !== undefined && params.y !== undefined) {
            await assertViewportClickPoint(runtime, adapter, workspaceId, executablePath, params.x, params.y);
            await runAgent(runtime, adapter, workspaceId, executablePath, ['mouse', 'move', String(params.x), String(params.y)], { execTimeoutMs: 20_000 });
            await runAgent(runtime, adapter, workspaceId, executablePath, ['mouse', 'down', 'left'], { execTimeoutMs: 20_000 });
            await runAgent(runtime, adapter, workspaceId, executablePath, ['mouse', 'up', 'left'], { execTimeoutMs: 20_000 });
            record(true);
            return { content: [{ type: 'text', text: `Clicked (${params.x}, ${params.y})` }], details: undefined };
          }
          throw new Error("Provide 'selector' or both 'x' and 'y'");
        }

        if (action === 'type') {
          if (!params.text) throw new Error('text is required for type action');
          if (params.selector) {
            if (params.clear) {
              await runAgent(runtime, adapter, workspaceId, executablePath, ['fill', params.selector, params.text]);
              record(true);
              return { content: [{ type: 'text', text: `Filled ${params.selector}.` }], details: undefined };
            }
            const response = await runAgent(runtime, adapter, workspaceId, executablePath, ['type', params.selector, params.text]);
            record(true);
            return { content: [{ type: 'text', text: formatBrowserText(response, `Typed into ${params.selector}`) }], details: undefined };
          }
          const response = await runAgent(runtime, adapter, workspaceId, executablePath, ['keyboard', 'type', params.text]);
          record(true);
          return { content: [{ type: 'text', text: formatBrowserText(response, 'Typed into focused element.') }], details: undefined };
        }

        if (action === 'press_key') {
          if (!params.key) throw new Error('key is required for press_key action');
          const response = await runAgent(runtime, adapter, workspaceId, executablePath, ['press', params.key]);
          record(true);
          return { content: [{ type: 'text', text: formatBrowserText(response, `Pressed ${params.key}`) }], details: undefined };
        }

        if (action === 'scroll') {
          const direction = params.direction ?? 'down';
          const amount = String(params.amount ?? 500);
          const args = ['scroll', direction, amount];
          if (params.selector) args.push('--selector', params.selector);
          const response = await runAgent(runtime, adapter, workspaceId, executablePath, args);
          record(true);
          return { content: [{ type: 'text', text: formatBrowserText(response, `Scrolled ${direction}`) }], details: undefined };
        }

        if (action === 'evaluate') {
          if (!params.expression) throw new Error('expression is required for evaluate');
          const response = await runEval(runtime, adapter, workspaceId, executablePath, params.expression);
          record(true);
          return { content: [{ type: 'text', text: formatBrowserText(response) }], details: undefined };
        }

        if (action === 'get_text') {
          const response = await runAgent(
            runtime,
            adapter,
            workspaceId,
            executablePath,
            params.selector ? ['get', 'text', params.selector] : ['get', 'text', 'body'],
          );
          record(true);
          return { content: [{ type: 'text', text: formatBrowserText(response, 'Text retrieved.') }], details: undefined };
        }

        if (action === 'snapshot') {
          const response = await runAgent(runtime, adapter, workspaceId, executablePath, ['snapshot'], { execTimeoutMs: 20_000 });
          record(true);
          return { content: [{ type: 'text', text: formatBrowserText(response, 'Snapshot captured.') }], details: undefined };
        }

        if (action === 'wait') {
          const timeoutMs = params.timeout ?? 10_000;
          const response = params.selector
            ? await runAgent(runtime, adapter, workspaceId, executablePath, ['wait', params.selector], { execTimeoutMs: timeoutMs + 10_000, defaultActionTimeoutMs: timeoutMs })
            : await runAgent(runtime, adapter, workspaceId, executablePath, ['wait', String(timeoutMs)], { execTimeoutMs: timeoutMs + 10_000 });
          record(true);
          return {
            content: [{ type: 'text', text: formatBrowserText(response, params.selector ? `Element '${params.selector}' is ready.` : `Waited ${timeoutMs}ms.`) }],
            details: undefined,
          };
        }

        if (action === 'screenshot') {
          const shotPath = defaultScreenshotPath(adapter);
          const shotDir = runtimeDirname(shotPath);
          if (shotDir) await runtime.createDirectory({ path: shotDir, recursive: true });
          await runtime.delete({ path: shotPath }).catch(() => undefined);
          const screenshotArgs = ['screenshot', shotPath];
          if (params.full_page) screenshotArgs.push('--full');
          const response = await runAgent(runtime, adapter, workspaceId, executablePath, screenshotArgs, { execTimeoutMs: 20_000 });
          const imagePath = response.path || shotPath;
          const imageData = response.screenshot && looksLikeBase64(response.screenshot)
            ? response.screenshot
            : await readImageAsBase64(runtime, imagePath);
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
