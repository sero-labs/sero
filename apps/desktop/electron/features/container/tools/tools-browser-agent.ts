import type { Static } from '@sinclair/typebox';
import type { ToolDefinition, ExtensionContext } from '@mariozechner/pi-coding-agent';
import type { AgentToolResult, AgentToolUpdateCallback } from '@mariozechner/pi-agent-core';
import type { ContainerManager } from '..';
import { BrowserParams, shellEscape } from './tool-schemas';

const daemonReadyWorkspaces = new Set<string>();
const metricsByWorkspace = new Map<string, {
  success: number;
  failure: number;
  totalLatencyMs: number;
}>();

interface AgentBrowserJson {
  success?: boolean;
  message?: string;
  error?: string;
  warning?: string;
  title?: string;
  url?: string;
  text?: string;
  output?: string;
  screenshot?: string;
  path?: string;
  running?: boolean;
  data?: unknown;
}

function command(args: string[]): string {
  return `agent-browser ${args.map((arg) => `'${shellEscape(arg)}'`).join(' ')}`;
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

function looksLikeBase64(value: string): boolean {
  return /^[A-Za-z0-9+/=]+$/.test(value) && value.length > 64;
}

async function readImageAsBase64(
  cm: ContainerManager,
  workspaceId: string,
  imagePath: string,
): Promise<string> {
  const escaped = shellEscape(imagePath);
  const result = await cm.exec(
    workspaceId,
    `python3 -c "import base64;print(base64.b64encode(open('${escaped}','rb').read()).decode(), end='')"`,
    undefined,
    15_000,
  );

  if (result.exitCode !== 0 || !result.stdout.trim()) {
    throw new Error(`Failed reading screenshot at ${imagePath}: ${result.stderr || result.stdout}`);
  }

  return result.stdout.trim();
}

async function ensureAgentBrowserReady(cm: ContainerManager, workspaceId: string): Promise<void> {
  const hasBinary = await cm.exec(workspaceId, 'command -v agent-browser', undefined, 5_000);
  if (hasBinary.exitCode !== 0) {
    throw new Error(
      'agent-browser CLI is not installed in this container.',
    );
  }

  if (daemonReadyWorkspaces.has(workspaceId)) return;

  const daemonStatus = await cm.exec(
    workspaceId,
    `${command(['daemon', 'status', '--json', '--no-color', '--yes'])} || true`,
    undefined,
    10_000,
  );

  const parsedStatus = parseJsonOutput(daemonStatus.stdout);
  const data = parsedStatus.data as { running?: boolean } | undefined;
  const alreadyRunning = Boolean(
    parsedStatus.running ||
    data?.running ||
    (typeof parsedStatus.message === 'string' &&
      parsedStatus.message.toLowerCase().includes('running')),
  );

  if (!alreadyRunning) {
    const daemonStart = await cm.exec(
      workspaceId,
      command(['daemon', 'start', '--json', '--no-color', '--yes']),
      undefined,
      20_000,
    );

    if (daemonStart.exitCode !== 0) {
      throw new Error(`Failed to start agent-browser daemon: ${daemonStart.stderr || daemonStart.stdout}`);
    }
  }

  daemonReadyWorkspaces.add(workspaceId);
}

async function runAgent(
  cm: ContainerManager,
  workspaceId: string,
  args: string[],
  timeoutMs = 60_000,
): Promise<AgentBrowserJson> {
  const result = await cm.exec(
    workspaceId,
    command([...args, '--json', '--no-color', '--yes']),
    undefined,
    timeoutMs,
  );

  const parsed = parseJsonOutput(result.stdout);
  if (result.exitCode !== 0) {
    const fallback = result.stderr || result.stdout || 'Unknown agent-browser error';
    throw new Error(parsed.error || fallback);
  }

  if (parsed.success === false) {
    throw new Error(parsed.error || parsed.message || 'agent-browser command failed');
  }

  return parsed;
}

function asText(response: AgentBrowserJson, fallback = 'Done.'): string {
  const parts = [
    response.message,
    response.warning ? `Warning: ${response.warning}` : undefined,
    response.title ? `Title: ${response.title}` : undefined,
    response.url ? `URL: ${response.url}` : undefined,
    response.text,
    response.output,
  ]
    .filter(Boolean)
    .map(String);

  return parts.join('\n') || fallback;
}

export function createAgentBrowser(
  cm: ContainerManager,
  workspaceId: string,
): ToolDefinition {
  return {
    name: 'browser',
    label: 'browser',
    description:
      'Control browser automation through Vercel agent-browser with daemon-backed sessions. ' +
      'Use launch first, then navigate/click/type/screenshot/get_text/wait, and close when done.',
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
        const cur = metricsByWorkspace.get(workspaceId) ?? { success: 0, failure: 0, totalLatencyMs: 0 };
        if (ok) cur.success += 1;
        else cur.failure += 1;
        cur.totalLatencyMs += Date.now() - startedAt;
        metricsByWorkspace.set(workspaceId, cur);
      };

      if (signal?.aborted) throw new Error('Operation aborted');

      if (params.action === 'start_recording' || params.action === 'stop_recording') {
        await ensureAgentBrowserReady(cm, workspaceId);
      }

      if (params.action === 'start_recording') {
        const targetPath = params.save_path ?? '/workspace/agent-browser-recording.webm';
        const response = await runAgent(cm, workspaceId, ['record', 'start', targetPath], 20_000);
        record(true);
        return {
          content: [{ type: 'text', text: asText(response, `Recording started: ${targetPath}`) }],
          details: undefined,
        };
      }

      if (params.action === 'stop_recording') {
        const response = await runAgent(cm, workspaceId, ['record', 'stop'], 20_000);
        record(true);
        return {
          content: [{ type: 'text', text: asText(response, 'Recording stopped.') }],
          details: undefined,
        };
      }

      await ensureAgentBrowserReady(cm, workspaceId);

      if (params.action === 'close') {
        await runAgent(cm, workspaceId, ['close']);
        await cm.exec(workspaceId, `${command(['daemon', 'stop', '--json', '--no-color', '--yes'])} || true`);
        daemonReadyWorkspaces.delete(workspaceId);
        record(true);
        return { content: [{ type: 'text', text: 'Browser closed.' }], details: undefined };
      }

      if (params.action === 'launch' || params.action === 'navigate') {
        if (!params.url) throw new Error('url is required for launch/navigate');
        const response = await runAgent(cm, workspaceId, ['open', params.url]);
        record(true);
        return { content: [{ type: 'text', text: asText(response, `Opened ${params.url}`) }], details: undefined };
      }

      if (params.action === 'click') {
        if (params.selector) {
          const response = await runAgent(cm, workspaceId, ['click', params.selector]);
          record(true);
          return { content: [{ type: 'text', text: asText(response, `Clicked ${params.selector}`) }], details: undefined };
        }

        if (params.x !== undefined && params.y !== undefined) {
          const expression = `(() => { const el = document.elementFromPoint(${params.x}, ${params.y}); if (!el) throw new Error('No element at point'); (el as HTMLElement).click(); return 'clicked'; })()`;
          const response = await runAgent(cm, workspaceId, ['eval', expression]);
          record(true);
          return { content: [{ type: 'text', text: asText(response, `Clicked (${params.x}, ${params.y})`) }], details: undefined };
        }

        throw new Error("Provide 'selector' or both 'x' and 'y'");
      }

      if (params.action === 'type') {
        if (!params.text) throw new Error('text is required for type action');

        if (params.selector) {
          if (params.clear) {
            await runAgent(cm, workspaceId, ['fill', params.selector, params.text]);
            record(true);
            return { content: [{ type: 'text', text: `Filled ${params.selector}.` }], details: undefined };
          }

          const response = await runAgent(cm, workspaceId, ['type', params.selector, params.text]);
          record(true);
          return { content: [{ type: 'text', text: asText(response, `Typed into ${params.selector}`) }], details: undefined };
        }

        const response = await runAgent(cm, workspaceId, ['keyboard', 'type', params.text]);
        record(true);
        return { content: [{ type: 'text', text: asText(response, 'Typed into focused element.') }], details: undefined };
      }

      if (params.action === 'press_key') {
        if (!params.key) throw new Error('key is required for press_key action');
        const response = await runAgent(cm, workspaceId, ['press', params.key]);
        record(true);
        return { content: [{ type: 'text', text: asText(response, `Pressed ${params.key}`) }], details: undefined };
      }

      if (params.action === 'scroll') {
        const direction = params.direction ?? 'down';
        const amount = String(params.amount ?? 500);
        const response = await runAgent(cm, workspaceId, ['scroll', direction, amount]);
        record(true);
        return { content: [{ type: 'text', text: asText(response, `Scrolled ${direction}`) }], details: undefined };
      }

      if (params.action === 'evaluate') {
        if (!params.expression) throw new Error('expression is required for evaluate');
        const response = await runAgent(cm, workspaceId, ['eval', params.expression]);
        record(true);
        return { content: [{ type: 'text', text: asText(response) }], details: undefined };
      }

      if (params.action === 'get_text') {
        if (params.selector) {
          const response = await runAgent(cm, workspaceId, ['get', 'text', params.selector]);
          record(true);
          return { content: [{ type: 'text', text: asText(response, 'Text retrieved.') }], details: undefined };
        }

        const response = await runAgent(cm, workspaceId, ['get', 'text', 'body']);
        record(true);
        return { content: [{ type: 'text', text: asText(response, 'Text retrieved.') }], details: undefined };
      }

      if (params.action === 'snapshot') {
        const response = await runAgent(cm, workspaceId, ['snapshot'], 20_000);
        record(true);
        return { content: [{ type: 'text', text: asText(response, 'Snapshot captured.') }], details: undefined };
      }

      if (params.action === 'wait') {
        const timeoutMs = params.timeout ?? 1000;
        if (params.selector) {
          const response = await runAgent(cm, workspaceId, ['wait', params.selector], timeoutMs + 10_000);
          record(true);
          return {
            content: [{ type: 'text', text: asText(response, `Element '${params.selector}' is ready.`) }],
            details: undefined,
          };
        }

        const response = await runAgent(cm, workspaceId, ['wait', String(timeoutMs)], timeoutMs + 10_000);
        record(true);
        return { content: [{ type: 'text', text: asText(response, `Waited ${timeoutMs}ms.`) }], details: undefined };
      }

      if (params.action === 'screenshot') {
        const shotPath = '/tmp/sero-agent-browser-shot.png';
        const screenshotArgs = ['screenshot', shotPath];
        if (params.full_page) screenshotArgs.push('--full');
        const response = await runAgent(cm, workspaceId, screenshotArgs, 20_000);
        const imagePath = response.path || shotPath;
        const imageData = response.screenshot && looksLikeBase64(response.screenshot)
          ? response.screenshot
          : await readImageAsBase64(cm, workspaceId, imagePath);
        record(true);

        return {
          content: [
            { type: 'image', data: imageData, mimeType: 'image/png' },
            { type: 'text', text: asText(response, 'Screenshot captured.') },
          ],
          details: undefined,
        };
      }

      record(false);
      throw new Error(`Unsupported action for agent-browser backend: ${action}`);
    },
  };
}
