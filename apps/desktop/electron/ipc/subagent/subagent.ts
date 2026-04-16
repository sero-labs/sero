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
import { broadcastToWindows } from '../lib/window-broadcast';

const AGENTS_DIR = path.join(SERO_AGENT_DIR, 'agents');

/** Validate agent name to prevent path traversal. */
const VALID_AGENT_NAME = /^[a-z0-9-]+$/;

function validateAgentName(name: string): void {
  if (!VALID_AGENT_NAME.test(name)) {
    throw new Error(`Invalid agent name '${name}'. Use only lowercase letters, numbers, and hyphens.`);
  }
}

function sendToAllWindows(channel: string, ...args: unknown[]): void {
  broadcastToWindows(channel, ...args);
}

function sendEvent(event: SubagentEvent): void {
  sendToAllWindows(IpcChannels.subagent.event, event);
}

/**
 * Simple throttle — call at most once every `ms` milliseconds.
 * Trailing call is guaranteed if there are queued invocations.
 */
function createThrottle<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const throttled = (...args: Parameters<T>) => {
    lastArgs = args;
    if (timer) return;
    fn(...args);
    lastArgs = null;
    timer = setTimeout(() => {
      timer = null;
      if (lastArgs) fn(...lastArgs);
      lastArgs = null;
    }, ms);
  };

  return throttled as T;
}

// Throttled senders for high-frequency events
const sendToolActivity = createThrottle(
  (id: string, activity: SubagentToolActivity[]) => {
    sendEvent({ type: 'subagent_tool_activity', id, activity });
  },
  150,
);

const sendLiveOutput = createThrottle(
  (id: string, text: string) => {
    sendEvent({ type: 'subagent_live_output', id, text });
  },
  200,
);

/**
 * Register all subagent IPC handlers.
 * Call once from the main IPC registration.
 */
export function registerSubagentHandlers(): void {
  // ── Forward tracker events to renderer ─────────────────────

  subagentManager.tracker.on('subagent_start', (entry: SubagentEntry) => {
    sendEvent({ type: 'subagent_start', entry });
  });

  subagentManager.tracker.on('subagent_progress', (id: string, usage: Partial<SubagentUsage>) => {
    sendEvent({ type: 'subagent_progress', id, usage });
  });

  subagentManager.tracker.on('subagent_tool_activity', (id: string, activity: SubagentToolActivity[]) => {
    sendToolActivity(id, activity);
  });

  subagentManager.tracker.on('subagent_live_output', (id: string, text: string) => {
    sendLiveOutput(id, text);
  });

  subagentManager.tracker.on('subagent_end', (entry: SubagentEntry) => {
    sendEvent({
      type: 'subagent_end',
      id: entry.id,
      status: entry.status,
      response: entry.fullResponse,
      error: entry.error,
      usage: entry.usage,
      durationMs: entry.durationMs ?? 0,
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
    async (_e, workspaceId: string) => {
      return subagentManager.snapshot(workspaceId);
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
