/**
 * Debug logging IPC handlers.
 *
 * Logs raw model messages (AgentSession events) to a JSONL file at
 * $SERO_DEBUG_DIR/model-messages.jsonl (defaults to ~/.sero-ui/debug/).
 * Toggled on/off from the UI via a debug icon in the StatusBar.
 *
 * Three log entry types:
 *   1. **event** — every raw AgentSessionEvent (message_start/end, tool_*, etc.)
 *   2. **turn_context** — pre-filter request snapshot on `turn_start`:
 *      systemPrompt, tools (name + description + parameters), all messages,
 *      model, and thinkingLevel.
 *   3. **provider_request** — final provider payload on `before_provider_request`
 *      after extensions have filtered messages or otherwise mutated the request.
 */

import { ipcMain, BrowserWindow, shell } from 'electron';
import { promises as fs, createWriteStream, type WriteStream } from 'fs';
import path from 'path';
import type { AgentSession } from '@mariozechner/pi-coding-agent';
import { SERO_HOME } from '@electron/platform/env';
import { IpcChannels } from '@/types/ipc';
import { tryParseImageJson } from '../agent/core/tool-result-images';

/** Resolve debug dir from SERO_DEBUG_DIR env var, falling back to ~/.sero-ui/debug. */
const DEBUG_DIR = process.env.SERO_DEBUG_DIR || path.join(SERO_HOME, 'debug');
const LOG_PATH = path.join(DEBUG_DIR, 'model-messages.jsonl');

// ── Debug Logger Singleton ───────────────────────────────────

let enabled = false;
let writeStream: WriteStream | null = null;

async function ensureDir(): Promise<void> {
  await fs.mkdir(DEBUG_DIR, { recursive: true });
}

function openStream(): void {
  if (writeStream) return;
  writeStream = createWriteStream(LOG_PATH, { flags: 'a' });
  writeStream.on('error', (err) => {
    console.error('[debug] Write stream error:', err);
    writeStream = null;
  });
}

function closeStream(): void {
  if (!writeStream) return;
  writeStream.end();
  writeStream = null;
}

/** Enable or disable debug logging. Returns new state. */
async function setEnabled(value: boolean): Promise<boolean> {
  if (value === enabled) return enabled;

  if (value) {
    await ensureDir();
    openStream();
    writeEntry({ _marker: 'logging_enabled', timestamp: new Date().toISOString() });
  } else {
    writeEntry({ _marker: 'logging_disabled', timestamp: new Date().toISOString() });
    closeStream();
  }

  enabled = value;
  broadcastState();
  return enabled;
}


// ── Public logging API (called from agent.ts) ────────────────

/**
 * Log a raw AgentSessionEvent.
 * No-op if logging is disabled.
 */
export function logRawEvent(sessionId: string, event: unknown): void {
  if (!enabled) return;
  writeEntry({ _type: 'event', timestamp: new Date().toISOString(), sessionId, event });
}

/**
 * Log a full turn context snapshot — the complete LLM request payload.
 * Called on `turn_start` so we capture exactly what's being sent to the model.
 *
 * Includes: systemPrompt, model, thinkingLevel, tools (serialisable subset),
 * and the full message array.
 */
export function logTurnContext(sessionId: string, session: AgentSession): void {
  if (!enabled) return;

  const state = session.agent.state;

  // Serialise tools to a portable shape (drop the execute function)
  const tools = state.tools.map((t) => ({
    name: t.name,
    label: t.label,
    description: t.description,
    parameters: t.parameters,
  }));

  writeEntry({
    _type: 'turn_context',
    timestamp: new Date().toISOString(),
    sessionId,
    model: {
      provider: state.model?.provider ?? 'unknown',
      id: state.model?.id ?? 'unknown',
      name: state.model?.name ?? 'unknown',
    },
    thinkingLevel: state.thinkingLevel,
    systemPrompt: state.systemPrompt,
    tools,
    messageCount: state.messages.length,
    messages: state.messages,
  });
}

/**
 * Log the final provider payload after extensions have applied `context`
 * filtering and `before_provider_request` mutations.
 */
export function logProviderRequest(sessionId: string, payload: unknown): void {
  if (!enabled) return;
  writeEntry({
    _type: 'provider_request',
    timestamp: new Date().toISOString(),
    sessionId,
    payload,
  });
}

// ── Internal helpers ─────────────────────────────────────────

function redactBase64(label: string, value: string): string {
  const approxKb = Math.round((value.length * 0.75) / 1024);
  return `[omitted ${label}: ${approxKb}KB, ${value.length} base64 chars]`;
}

function sanitizeString(value: string): unknown {
  if (value.startsWith('data:image/')) {
    const match = value.match(/^data:([^;]+);base64,(.+)$/);
    if (match) return `[omitted image data URL: ${match[1]}, ${redactBase64('image', match[2])}]`;
  }

  const parsedImage = tryParseImageJson(value);
  if (parsedImage) {
    return JSON.stringify({
      type: 'image',
      mimeType: parsedImage.mimeType,
      description: parsedImage.description,
      base64: redactBase64('image', parsedImage.data),
    });
  }

  if ((value.startsWith('{') || value.startsWith('[')) && value.length > 128) {
    try {
      return JSON.stringify(sanitizeValue(JSON.parse(value)));
    } catch {
      // Not JSON; fall through.
    }
  }

  const compact = value.replace(/\s+/g, '');
  if (compact.length > 2048 && /^(?:iVBORw0KGgo|\/9j\/|UklGR|R0lGOD|Qk)/.test(compact)) {
    return redactBase64('image', compact);
  }

  return value;
}

function sanitizeValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return sanitizeString(value);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, seen));
  }

  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    if ((key === 'data' || key === 'base64') && typeof entry === 'string' && entry.length > 64) {
      sanitized[key] = redactBase64(key, entry);
      continue;
    }
    sanitized[key] = sanitizeValue(entry, seen);
  }
  return sanitized;
}

/** Write a single JSONL line to the log. No-op if stream is closed. */
function writeEntry(data: Record<string, unknown>): void {
  if (!writeStream) return;
  try {
    writeStream.write(JSON.stringify(sanitizeValue(data)) + '\n');
  } catch (err) {
    console.error('[debug] Failed to write log entry:', err);
  }
}

/** Push current debug state to all renderer windows. */
function broadcastState(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.debug.stateChanged, enabled);
  }
}

// ── IPC Registration ─────────────────────────────────────────

export function registerDebugHandlers(): void {
  ipcMain.handle(IpcChannels.debug.toggle, async (): Promise<boolean> => {
    return setEnabled(!enabled);
  });

  ipcMain.handle(IpcChannels.debug.getState, async (): Promise<boolean> => {
    return enabled;
  });

  ipcMain.handle(IpcChannels.debug.openLog, async (): Promise<void> => {
    await ensureDir();
    try {
      await fs.access(LOG_PATH);
    } catch {
      await fs.writeFile(LOG_PATH, '');
    }
    shell.showItemInFolder(LOG_PATH);
  });

  ipcMain.handle(IpcChannels.debug.clearLog, async (): Promise<void> => {
    closeStream();
    try {
      await fs.writeFile(LOG_PATH, '');
    } catch {
      // File may not exist
    }
    if (enabled) {
      openStream();
    }
  });
}
