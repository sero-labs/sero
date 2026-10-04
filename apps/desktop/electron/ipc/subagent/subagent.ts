/**
 * IPC handlers for subagent orchestration.
 *
 * Bridges the SubagentManager's tracker events to the renderer
 * and handles list/snapshot/abort requests.
 */

import { ipcMain } from 'electron';
import { readFile, writeFile, unlink, mkdir, rename } from 'fs/promises';
import path from 'path';
import { IpcChannels } from '@/types/ipc-channels';
import { subagentManager } from '@electron/shared/infra/shared-infra';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import type { SubagentEntry, SubagentUsage, SubagentToolActivity } from '@electron/features/subagent/core/types';
import type {
  SubagentEvent,
  SubagentAgentSummary,
  SubagentAgentFile,
} from '@/types/ipc';
import { broadcastToWindows, sendToWindows } from '../lib/window-broadcast';
import { PerRunThrottle, SubagentWatchRegistry } from './live-watch';

const AGENTS_DIR = path.join(SERO_AGENT_DIR, 'agents');
const MAX_RENDERER_TEXT_CHARS = 20_000;
const MAX_TOOL_ARGS_CHARS = 1_000;

/** Validate agent name to prevent path traversal. */
const VALID_AGENT_NAME = /^[a-z0-9-]+$/;

function validateAgentName(name: string): void {
  if (!VALID_AGENT_NAME.test(name)) {
    throw new Error(`Invalid agent name '${name}'. Use only lowercase letters, numbers, and hyphens.`);
  }
}

function truncateHead(text: string | undefined, maxChars: number): string | undefined {
  if (!text || text.length <= maxChars) return text;
  const omitted = text.length - maxChars;
  return `${text.slice(0, maxChars)}\n\n… truncated ${omitted.toLocaleString()} chars for renderer stability.`;
}

function truncateTail(text: string | undefined, maxChars: number): string | undefined {
  if (!text || text.length <= maxChars) return text;
  const omitted = text.length - maxChars;
  return `… truncated ${omitted.toLocaleString()} earlier chars for renderer stability.\n\n${text.slice(-maxChars)}`;
}

function sanitizeToolActivity(activity: SubagentToolActivity[]): SubagentToolActivity[] {
  return activity.map((item) => ({
    ...item,
    argsSummary: truncateHead(item.argsSummary, MAX_TOOL_ARGS_CHARS) ?? '',
  }));
}

function sanitizeEntry(entry: SubagentEntry): SubagentEntry {
  const fullResponse = truncateHead(entry.fullResponse, MAX_RENDERER_TEXT_CHARS);
  return {
    ...entry,
    fullResponse,
    responsePreview: entry.responsePreview ?? fullResponse?.slice(0, 500),
    error: truncateHead(entry.error, MAX_RENDERER_TEXT_CHARS),
    liveOutput: truncateTail(entry.liveOutput, MAX_RENDERER_TEXT_CHARS) ?? '',
    toolActivity: sanitizeToolActivity(entry.toolActivity),
  };
}

function sendEvent(event: SubagentEvent): void {
  broadcastToWindows(IpcChannels.subagent.event, event);
}

function sendEventToWindows(webContentsIds: ReadonlySet<number>, event: SubagentEvent): void {
  sendToWindows(webContentsIds, IpcChannels.subagent.event, event);
}

/** Windows that show each run. Live events go only to these. */
const watchRegistry = new SubagentWatchRegistry();

/** Windows whose destruction handler is already attached. */
const cleanupBoundWindows = new Set<number>();

/**
 * Throttled senders for high-frequency events. Each run keeps its own timer,
 * so a busy run cannot starve a quiet one.
 */
const sendToolActivity = new PerRunThrottle<SubagentToolActivity[]>(
  (id, activity) => {
    const watchers = watchRegistry.watchers(id);
    if (watchers.length === 0) return;
    sendEventToWindows(new Set(watchers), { type: 'subagent_tool_activity', id, activity });
  },
  150,
);

/** Says when the newest live text is reasoning, so a view never shows it as the answer. */
function reasoningMark(runId: string): { reasoning?: true } {
  return subagentManager.tracker.get(runId)?.liveReasoning ? { reasoning: true } : {};
}

const sendLiveOutput = new PerRunThrottle<string>(
  (id, text) => {
    const watchers = watchRegistry.watchers(id);
    if (watchers.length === 0) return;
    sendEventToWindows(new Set(watchers), { type: 'subagent_live_output', id, text, ...reasoningMark(id) });
  },
  200,
);

/** Forget a window's watches when it closes. */
function bindWindowCleanup(webContents: Electron.WebContents): void {
  const id = webContents.id;
  if (cleanupBoundWindows.has(id)) return;
  cleanupBoundWindows.add(id);
  webContents.once('destroyed', () => {
    cleanupBoundWindows.delete(id);
    watchRegistry.dropWindow(id);
  });
}

/**
 * Register all subagent IPC handlers.
 * Call once from the main IPC registration.
 */
export function registerSubagentHandlers(): void {
  // ── Forward tracker events to renderer ─────────────────────

  subagentManager.tracker.on('subagent_start', (entry: SubagentEntry) => {
    sendEvent({ type: 'subagent_start', entry: sanitizeEntry(entry) });
  });

  subagentManager.tracker.on('subagent_progress', (id: string, usage: Partial<SubagentUsage>) => {
    sendEvent({ type: 'subagent_progress', id, usage });
  });

  subagentManager.tracker.on('subagent_tool_activity', (id: string, activity: SubagentToolActivity[]) => {
    if (!watchRegistry.isWatched(id)) return;
    sendToolActivity.push(id, sanitizeToolActivity(activity));
  });

  subagentManager.tracker.on('subagent_live_output', (id: string, text: string) => {
    if (!watchRegistry.isWatched(id)) return;
    sendLiveOutput.push(id, truncateTail(text, MAX_RENDERER_TEXT_CHARS) ?? '');
  });

  subagentManager.tracker.on('subagent_end', (entry: SubagentEntry) => {
    // The run is over: drop its held frames and the watches that fed them.
    sendLiveOutput.clear(entry.id);
    sendToolActivity.clear(entry.id);
    watchRegistry.dropRun(entry.id);

    const rendererEntry = sanitizeEntry(entry);
    sendEvent({
      type: 'subagent_end',
      id: rendererEntry.id,
      status: rendererEntry.status,
      response: rendererEntry.fullResponse,
      error: rendererEntry.error,
      usage: rendererEntry.usage,
      durationMs: rendererEntry.durationMs ?? 0,
    });
  });

  subagentManager.tracker.on('subagent_clear', (parentSessionId: string) => {
    sendEvent({ type: 'subagent_clear', parentSessionId });
  });

  // ── Request/Response handlers ──────────────────────────────

  ipcMain.handle(
    IpcChannels.subagent.listAgents,
    async (): Promise<SubagentAgentSummary[]> => {
      const agents = await subagentManager.listAgents();
      return agents.map((a) => ({
        name: a.name,
        description: a.description,
        model: a.model,
        thinking: a.thinking,
        timeoutMs: a.timeoutMs,
      }));
    },
  );

  ipcMain.handle(
    IpcChannels.subagent.snapshot,
    async (_e, workspaceId: string): Promise<SubagentEntry[]> => {
      return subagentManager.snapshot(workspaceId).map(sanitizeEntry);
    },
  );

  // ── Live watch ─────────────────────────────────────────────

  ipcMain.handle(
    IpcChannels.subagent.watch,
    async (event, runId: string): Promise<void> => {
      bindWindowCleanup(event.sender);
      watchRegistry.watch(event.sender.id, runId);

      // Show where the run is now. Text sent while no watch was open is not replayed.
      const entry = subagentManager.tracker.get(runId);
      if (!entry) return;
      const oneWindow = new Set([event.sender.id]);
      const liveText = truncateTail(entry.liveOutput, MAX_RENDERER_TEXT_CHARS);
      if (liveText) {
        sendEventToWindows(oneWindow, {
          type: 'subagent_live_output',
          id: runId,
          text: liveText,
          ...reasoningMark(runId),
        });
      }
      if (entry.toolActivity.length > 0) {
        sendEventToWindows(oneWindow, {
          type: 'subagent_tool_activity',
          id: runId,
          activity: sanitizeToolActivity(entry.toolActivity),
        });
      }
    },
  );

  ipcMain.handle(
    IpcChannels.subagent.unwatch,
    async (event, runId: string): Promise<void> => {
      watchRegistry.unwatch(event.sender.id, runId);
      if (watchRegistry.isWatched(runId)) return;
      // No view shows this run: drop the renderer-bound buffer.
      sendLiveOutput.clear(runId);
      sendToolActivity.clear(runId);
    },
  );

  ipcMain.handle(
    IpcChannels.subagent.abort,
    async (_e, subagentId: string) => {
      subagentManager.abortOne(subagentId);
    },
  );

  ipcMain.handle(
    IpcChannels.subagent.clearCompleted,
    async (_e, workspaceId: string) => {
      subagentManager.clearCompleted(workspaceId);
    },
  );

  // ── Agent file CRUD ────────────────────────────────────────

  ipcMain.handle(
    IpcChannels.subagent.readAgent,
    async (_e, name: string): Promise<SubagentAgentFile> => {
      validateAgentName(name);
      const filePath = path.join(AGENTS_DIR, `${name}.md`);
      const raw = await readFile(filePath, 'utf-8');
      return parseAgentFile(raw, name);
    },
  );

  ipcMain.handle(
    IpcChannels.subagent.writeAgent,
    async (_e, data: SubagentAgentFile): Promise<void> => {
      validateAgentName(data.name);
      await mkdir(AGENTS_DIR, { recursive: true });
      const filePath = path.join(AGENTS_DIR, `${data.name}.md`);
      const content = serializeAgentFile(data);
      const tmpPath = `${filePath}.tmp.${Date.now()}`;
      await writeFile(tmpPath, content, 'utf-8');
      await rename(tmpPath, filePath);
    },
  );

  ipcMain.handle(
    IpcChannels.subagent.deleteAgent,
    async (_e, name: string): Promise<void> => {
      validateAgentName(name);
      const filePath = path.join(AGENTS_DIR, `${name}.md`);
      await unlink(filePath);
    },
  );
}

// ── Agent file parsing/serialization ─────────────────────────

function parseEditableAgentModelField(raw: unknown): SubagentAgentFile['model'] | undefined {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed || undefined;
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }

  const obj = raw as Record<string, unknown>;
  const prefer = typeof obj.prefer === 'string' ? obj.prefer.trim() : '';
  if (!prefer) return undefined;

  const fallbacks = Array.isArray(obj.fallbacks)
    ? obj.fallbacks
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

  return { prefer, fallbacks };
}

function parseAgentFile(raw: string, fallbackName: string): SubagentAgentFile {
  const fmMatch = raw.match(/```json\s*\n([\s\S]*?)\n```/);
  let fm: Record<string, unknown> = {};
  let body = raw;

  if (fmMatch) {
    try { fm = JSON.parse(fmMatch[1]); } catch { /* ignore */ }
    body = raw.slice(fmMatch.index! + fmMatch[0].length).trim();
  }

  return {
    name: (fm.name as string) || fallbackName,
    description: (fm.description as string) || '',
    model: parseEditableAgentModelField(fm.model),
    thinking: fm.thinking as string | undefined,
    timeoutMs: fm.timeoutMs as number | undefined,
    tools: Array.isArray(fm.tools) ? fm.tools : undefined,
    systemPrompt: body,
  };
}

function serializeAgentFile(data: SubagentAgentFile): string {
  const fm: Record<string, unknown> = {
    name: data.name,
    description: data.description,
  };
  if (data.model) fm.model = data.model;
  if (data.thinking) fm.thinking = data.thinking;
  if (data.timeoutMs) fm.timeoutMs = data.timeoutMs;
  if (data.tools?.length) fm.tools = data.tools;

  return [
    '```json',
    JSON.stringify(fm, null, 2),
    '```',
    '',
    data.systemPrompt,
  ].join('\n');
}
